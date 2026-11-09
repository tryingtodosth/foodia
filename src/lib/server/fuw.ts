// Server side of the /fuw cookbook form (docs/fuw.md): anonymous submissions into a staging
// table, rate limited by a salted IP hash, reviewed and optionally promoted from /admin/fuw.
//
// Nothing here ever writes to `recipes` except `promoteFuwSubmission`, which only an admin can
// reach — an anonymous submitter can fill the staging table, never the public feed.
import { and, desc, eq, gte, isNull, inArray, sql } from 'drizzle-orm';
import type { Db } from './db';
import * as schema from './db/schema';
import { createRecipe, validateRecipeInput, RecipeValidationError } from './api/createRecipe';
import {
	FUW_AFFILIATIONS,
	FUW_KEY_PATTERN,
	fuwKeyFromUrl,
	type FuwStatus,
	type FuwSubmission,
	type FuwSubmissionInput
} from '$lib/types/fuw';
import type { CreateRecipeInput } from '$lib/types/recipeInput';

export class FuwValidationError extends Error {}

/** Per salted IP hash, per rolling hour. Generous for a real person (a professor submitting
 *  three family recipes in one sitting), tight enough that a script can't flood the queue. */
export const FUW_SUBMISSIONS_PER_HOUR = 5;
export const FUW_UPLOADS_PER_HOUR = 30;
const MAX_PHOTOS = 6;

/** Server-side caps on every free-text field. The client enforces none of these on its own
 *  authority; an anonymous endpoint has to assume the request didn't come from our form. */
const CAP = {
	name: 200,
	summary: 500,
	description: 6000,
	ingredientName: 200,
	unit: 40,
	stepText: 3000,
	tag: 50,
	tags: 20,
	ingredients: 80,
	steps: 50,
	authorName: 150,
	affiliationDetail: 200,
	email: 200,
	story: 6000,
	url: 1000
} as const;

const EQUIPMENT_KEYS = ['oven', 'microwave', 'airfryer', 'blenderJug', 'kitchenScale'];
const RECIPE_LOCALES = ['pl', 'en'];

/** The account promoted recipes are authored by. Its password hash is deliberately unparseable
 *  (`verifyPassword` returns false for anything not `iterations:salt:hash`), so nobody can log
 *  in as it — it exists only so a promoted recipe has a real `author_id`. */
export const FUW_AUTHOR = {
	id: 'fuw-cookbook',
	email: 'ksiazka-fuw@foodia.net',
	displayName: 'Książka kucharska FUW'
} as const;

/** Salted SHA-256 of the client address. The salt should be the `FUW_IP_SALT` secret: without
 *  one, an IPv4 hash can be reversed by brute force over the whole address space, so the
 *  fallback is only acceptable locally. */
export async function hashClientIp(ip: string, platform: App.Platform | undefined): Promise<string> {
	const salt = (platform?.env as Record<string, unknown> | undefined)?.FUW_IP_SALT;
	const material = `${typeof salt === 'string' && salt ? salt : 'foodia-fuw-local'}:${ip}`;
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material));
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hourAgo(): string {
	return new Date(Date.now() - 60 * 60 * 1000).toISOString();
}

export async function recentSubmissionCount(db: Db, ipHash: string): Promise<number> {
	const [row] = await db
		.select({ n: sql<number>`count(*)` })
		.from(schema.fuwSubmissions)
		.where(and(eq(schema.fuwSubmissions.ipHash, ipHash), gte(schema.fuwSubmissions.submittedAt, hourAgo())));
	return Number(row?.n ?? 0);
}

export async function recentUploadCount(db: Db, ipHash: string): Promise<number> {
	const [row] = await db
		.select({ n: sql<number>`count(*)` })
		.from(schema.fuwUploads)
		.where(and(eq(schema.fuwUploads.ipHash, ipHash), gte(schema.fuwUploads.createdAt, hourAgo())));
	return Number(row?.n ?? 0);
}

export async function recordFuwUpload(db: Db, key: string, ipHash: string): Promise<void> {
	await db.insert(schema.fuwUploads).values({ key, ipHash, createdAt: new Date().toISOString() });
}

// ---------------------------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------------------------

function str(value: unknown, field: string, max: number, required: boolean): string {
	if (value === undefined || value === null || value === '') {
		if (required) throw new FuwValidationError(`${field} is required`);
		return '';
	}
	if (typeof value !== 'string') throw new FuwValidationError(`${field} must be text`);
	const trimmed = value.trim();
	if (required && !trimmed) throw new FuwValidationError(`${field} is required`);
	if (trimmed.length > max) throw new FuwValidationError(`${field} is too long (max ${max} characters)`);
	return trimmed;
}

function num(value: unknown, field: string, max: number): number {
	const n = typeof value === 'number' ? value : Number(value ?? 0);
	if (!Number.isFinite(n) || n < 0 || n > max) throw new FuwValidationError(`${field} is out of range`);
	return n;
}

function strList(value: unknown, field: string, maxItems: number, maxLen: number): string[] {
	if (value === undefined || value === null) return [];
	if (!Array.isArray(value)) throw new FuwValidationError(`${field} must be a list`);
	if (value.length > maxItems) throw new FuwValidationError(`Too many ${field} (max ${maxItems})`);
	return value.map((v) => str(v, field, maxLen, true));
}

/** Hero image: empty, an http(s) link, or one of this form's own uploads. Never another R2 path
 *  — a submission must not be able to point at someone else's private upload. */
function heroImage(value: unknown): string {
	const url = str(value, 'Hero image', CAP.url, false);
	if (!url) return '';
	if (fuwKeyFromUrl(url)) return url;
	if (/^https?:\/\/[^\s]+$/i.test(url)) return url;
	throw new FuwValidationError('Hero image must be an http(s) link or an uploaded photo');
}

function sanitizeRecipe(raw: unknown): CreateRecipeInput {
	if (!raw || typeof raw !== 'object') throw new FuwValidationError('Recipe is missing');
	const r = raw as Record<string, unknown>;

	const ingredients = Array.isArray(r.ingredients) ? r.ingredients : [];
	if (ingredients.length > CAP.ingredients) throw new FuwValidationError(`Too many ingredients (max ${CAP.ingredients})`);
	const steps = Array.isArray(r.steps) ? r.steps : [];
	if (steps.length > CAP.steps) throw new FuwValidationError(`Too many steps (max ${CAP.steps})`);

	const macros = (r.macros ?? {}) as Record<string, unknown>;
	const cost = r.costEstimate as Record<string, unknown> | undefined;
	const sourceLocale = str(r.sourceLocale, 'Recipe language', 5, false) || 'pl';
	if (!RECIPE_LOCALES.includes(sourceLocale)) throw new FuwValidationError('Recipe language must be pl or en');

	const recipe: CreateRecipeInput = {
		name: str(r.name, 'Recipe name', CAP.name, true),
		summary: str(r.summary, 'Summary', CAP.summary, true),
		description: str(r.description, 'Description', CAP.description, true),
		heroImage: heroImage(r.heroImage),
		tags: strList(r.tags, 'tags', CAP.tags, CAP.tag),
		dietFlags: strList(r.dietFlags, 'diet labels', CAP.tags, CAP.tag),
		requiredEquipment: strList(r.requiredEquipment, 'equipment', EQUIPMENT_KEYS.length, 30).filter((k) =>
			EQUIPMENT_KEYS.includes(k)
		),
		timeMinutes: Math.round(num(r.timeMinutes, 'Time', 60 * 24 * 7)),
		costEstimate:
			cost && cost.amount !== undefined
				? { amount: num(cost.amount, 'Cost', 100_000), currency: 'PLN' }
				: undefined,
		macros: {
			kcal: Math.round(num(macros.kcal, 'Calories', 100_000)),
			proteinG: num(macros.proteinG, 'Protein', 10_000),
			fatG: num(macros.fatG, 'Fat', 10_000),
			carbsG: num(macros.carbsG, 'Carbs', 10_000)
		},
		ingredients: ingredients.map((raw) => {
			const ing = (raw ?? {}) as Record<string, unknown>;
			return {
				name: str(ing.name, 'Ingredient name', CAP.ingredientName, true),
				quantity: num(ing.quantity, 'Ingredient quantity', 1_000_000),
				unit: str(ing.unit, 'Unit', CAP.unit, false)
			};
		}),
		steps: steps.map((raw) => {
			const step = (raw ?? {}) as Record<string, unknown>;
			const idx = Array.isArray(step.ingredientIndexes) ? step.ingredientIndexes : [];
			return {
				text: str(step.text, 'Step text', CAP.stepText, true),
				durationMinutes:
					step.durationMinutes === undefined || step.durationMinutes === null || step.durationMinutes === ''
						? undefined
						: Math.round(num(step.durationMinutes, 'Step duration', 60 * 24 * 7)),
				ingredientIndexes: idx.map((i) => {
					if (!Number.isInteger(i)) throw new FuwValidationError('Invalid step ingredient reference');
					return i as number;
				})
			};
		}),
		sourceLocale
	};

	// Same structural rules the Foodia composer's own write path enforces, so anything accepted
	// here can later be promoted with `createRecipe` without failing.
	try {
		validateRecipeInput(recipe);
	} catch (e) {
		if (e instanceof RecipeValidationError) throw new FuwValidationError(e.message);
		throw e;
	}
	return recipe;
}

/** Throws `FuwValidationError` with a reason a person can act on. */
export function validateFuwInput(raw: unknown): FuwSubmissionInput {
	if (!raw || typeof raw !== 'object') throw new FuwValidationError('Expected a JSON body');
	const b = raw as Record<string, unknown>;

	const affiliation = str(b.affiliation, 'Affiliation', 20, true);
	if (!(FUW_AFFILIATIONS as readonly string[]).includes(affiliation)) {
		throw new FuwValidationError('Unknown affiliation');
	}
	const email = str(b.email, 'Email', CAP.email, true);
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new FuwValidationError('Email address looks invalid');
	if (b.consent !== true) throw new FuwValidationError('Consent to publication is required');

	const photoKeys = strList(b.photoKeys, 'photos', MAX_PHOTOS, 80);
	for (const key of photoKeys) {
		if (!FUW_KEY_PATTERN.test(key)) throw new FuwValidationError('Invalid photo reference');
	}

	return {
		recipe: sanitizeRecipe(b.recipe),
		authorName: str(b.authorName, 'Name', CAP.authorName, true),
		affiliation: affiliation as FuwSubmissionInput['affiliation'],
		affiliationDetail: str(b.affiliationDetail, 'Affiliation detail', CAP.affiliationDetail, false) || undefined,
		email,
		story: str(b.story, 'Story', CAP.story, false) || undefined,
		photoKeys: [...new Set(photoKeys)],
		consent: true,
		locale: b.locale === 'en' ? 'en' : 'pl',
		website: typeof b.website === 'string' ? b.website : undefined
	};
}

// ---------------------------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------------------------

/** Every R2 key a submission references: its extra photos plus a hero image that is one of this
 *  form's own uploads. */
function referencedKeys(input: Pick<FuwSubmissionInput, 'recipe' | 'photoKeys'>): string[] {
	const hero = fuwKeyFromUrl(input.recipe.heroImage);
	return [...new Set([...(hero ? [hero] : []), ...input.photoKeys])];
}

export async function createFuwSubmission(db: Db, input: FuwSubmissionInput, ipHash: string): Promise<string> {
	const keys = referencedKeys(input);

	// Every referenced upload must exist and be unclaimed. Without this check a submission could
	// attach someone else's upload, and then accepting it would make that photo public.
	if (keys.length) {
		const rows = await db
			.select({ key: schema.fuwUploads.key })
			.from(schema.fuwUploads)
			.where(and(inArray(schema.fuwUploads.key, keys), isNull(schema.fuwUploads.submissionId)));
		if (rows.length !== keys.length) {
			throw new FuwValidationError('A photo is missing or already attached to another submission — upload it again');
		}
	}

	const id = crypto.randomUUID();
	const now = new Date().toISOString();
	await db.insert(schema.fuwSubmissions).values({
		id,
		status: 'pending',
		locale: input.locale,
		recipe: input.recipe,
		authorName: input.authorName,
		affiliation: input.affiliation,
		affiliationDetail: input.affiliationDetail ?? null,
		email: input.email,
		story: input.story ?? null,
		consentAt: now,
		ipHash,
		submittedAt: now
	});
	if (keys.length) {
		await db.update(schema.fuwUploads).set({ submissionId: id }).where(inArray(schema.fuwUploads.key, keys));
	}
	return id;
}

// ---------------------------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------------------------

export async function listFuwSubmissions(db: Db, status?: FuwStatus): Promise<FuwSubmission[]> {
	const rows = await db
		.select()
		.from(schema.fuwSubmissions)
		.where(status ? eq(schema.fuwSubmissions.status, status) : undefined)
		.orderBy(desc(schema.fuwSubmissions.submittedAt));
	const uploads = rows.length
		? await db
				.select({ key: schema.fuwUploads.key, submissionId: schema.fuwUploads.submissionId })
				.from(schema.fuwUploads)
				.where(inArray(schema.fuwUploads.submissionId, rows.map((r) => r.id)))
		: [];

	return rows.map((r) => {
		const hero = fuwKeyFromUrl(r.recipe.heroImage);
		return {
			id: r.id,
			status: r.status,
			locale: r.locale,
			recipe: r.recipe,
			authorName: r.authorName,
			affiliation: r.affiliation,
			affiliationDetail: r.affiliationDetail,
			email: r.email,
			story: r.story,
			// Extra photos only — the hero image is already on `recipe.heroImage`.
			photoKeys: uploads.filter((u) => u.submissionId === r.id && u.key !== hero).map((u) => u.key),
			submittedAt: r.submittedAt,
			reviewedAt: r.reviewedAt,
			promotedRecipeId: r.promotedRecipeId
		};
	});
}

export async function setFuwStatus(db: Db, id: string, status: FuwStatus, adminId: string): Promise<boolean> {
	const result = await db
		.update(schema.fuwSubmissions)
		.set({ status, reviewedAt: new Date().toISOString(), reviewedById: adminId })
		.where(eq(schema.fuwSubmissions.id, id))
		.returning({ id: schema.fuwSubmissions.id });
	return result.length > 0;
}

export class FuwConflictError extends Error {}

/** Deletes the submission and its R2 objects. Refused once promoted: the Foodia recipe may be
 *  using the hero photo, and deleting it would break a live page. */
export async function deleteFuwSubmission(db: Db, media: App.Platform['env']['MEDIA'] | undefined, id: string): Promise<boolean> {
	const [row] = await db
		.select({ promotedRecipeId: schema.fuwSubmissions.promotedRecipeId })
		.from(schema.fuwSubmissions)
		.where(eq(schema.fuwSubmissions.id, id));
	if (!row) return false;
	if (row.promotedRecipeId) {
		throw new FuwConflictError('This submission was promoted to a Foodia recipe — delete that recipe first');
	}
	const uploads = await db
		.select({ key: schema.fuwUploads.key })
		.from(schema.fuwUploads)
		.where(eq(schema.fuwUploads.submissionId, id));
	if (media && uploads.length) await media.delete(uploads.map((u) => u.key));
	await db.delete(schema.fuwUploads).where(eq(schema.fuwUploads.submissionId, id));
	await db.delete(schema.fuwSubmissions).where(eq(schema.fuwSubmissions.id, id));
	return true;
}

const AFFILIATION_LABEL: Record<string, { pl: string; en: string }> = {
	student: { pl: 'student(ka)', en: 'student' },
	phd: { pl: 'doktorant(ka)', en: 'PhD student' },
	professor: { pl: 'profesor(ka)', en: 'professor' },
	academic: { pl: 'pracownik naukowo-dydaktyczny', en: 'academic staff' },
	staff: { pl: 'pracownik administracji i obsługi', en: 'faculty staff' },
	alumni: { pl: 'absolwent(ka)', en: 'alumnus/alumna' },
	other: { pl: 'gość Wydziału', en: 'friend of the Faculty' }
};

export function affiliationLabel(affiliation: string, locale: string): string {
	const entry = AFFILIATION_LABEL[affiliation];
	if (!entry) return affiliation;
	return locale === 'en' ? entry.en : entry.pl;
}

async function ensureFuwAuthor(db: Db): Promise<string> {
	const [existing] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, FUW_AUTHOR.id));
	if (!existing) {
		await db.insert(schema.users).values({
			id: FUW_AUTHOR.id,
			email: FUW_AUTHOR.email,
			passwordHash: '!login-disabled',
			displayName: FUW_AUTHOR.displayName,
			createdAt: new Date().toISOString()
		});
	}
	return FUW_AUTHOR.id;
}

/** Turns an accepted (or still pending) submission into a real public Foodia recipe, authored by
 *  the cookbook account, with the contributor credited in the description. The email never
 *  leaves the staging table. Accepts the submission as a side effect. */
export async function promoteFuwSubmission(db: Db, id: string, adminId: string): Promise<string> {
	const [row] = await db.select().from(schema.fuwSubmissions).where(eq(schema.fuwSubmissions.id, id));
	if (!row) throw new FuwValidationError('Submission not found');
	if (row.promotedRecipeId) throw new FuwConflictError('Already promoted');
	if (row.status === 'rejected') throw new FuwConflictError('Rejected submissions cannot be promoted');

	const recipe = row.recipe;
	const lang = recipe.sourceLocale === 'en' ? 'en' : 'pl';
	const credit = [row.authorName, affiliationLabel(row.affiliation, lang), row.affiliationDetail]
		.filter(Boolean)
		.join(', ');
	const story = row.story ? `\n\n${lang === 'en' ? 'The story behind it' : 'Historia przepisu'}: ${row.story}` : '';
	const footer =
		lang === 'en'
			? `\n\n— ${credit}. From the Physics Faculty cookbook.`
			: `\n\n— ${credit}. Z Książki kucharskiej Wydziału Fizyki.`;

	const authorId = await ensureFuwAuthor(db);
	const recipeId = await createRecipe(db, authorId, {
		...recipe,
		description: `${recipe.description}${story}${footer}`,
		tags: [...new Set([...recipe.tags, 'fuw'])]
	});

	await db
		.update(schema.fuwSubmissions)
		.set({
			status: 'accepted',
			promotedRecipeId: recipeId,
			reviewedAt: new Date().toISOString(),
			reviewedById: adminId
		})
		.where(eq(schema.fuwSubmissions.id, id));
	return recipeId;
}

/** May a `fuw/` R2 key be served to someone who isn't an admin? Only once its submission has
 *  been accepted — an unreviewed upload is never publicly hosted. */
export async function isFuwKeyPublic(db: Db, key: string): Promise<boolean> {
	const [row] = await db
		.select({ status: schema.fuwSubmissions.status })
		.from(schema.fuwUploads)
		.innerJoin(schema.fuwSubmissions, eq(schema.fuwUploads.submissionId, schema.fuwSubmissions.id))
		.where(eq(schema.fuwUploads.key, key));
	return row?.status === 'accepted';
}

// ---------------------------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------------------------

function csvCell(value: unknown): string {
	let s = value === null || value === undefined ? '' : String(value);
	// Spreadsheet formula injection: a cell starting with = + - @ is executed by Excel/Sheets.
	// These are anonymous submissions, so treat every cell as hostile.
	if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
	return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function fuwSubmissionsToCsv(subs: FuwSubmission[], origin: string): string {
	const media = (key: string) => `${origin}/api/media/${key}`;
	const header = [
		'id',
		'status',
		'submitted_at',
		'author_name',
		'affiliation',
		'affiliation_detail',
		'email',
		'recipe_language',
		'name',
		'summary',
		'description',
		'story',
		'time_minutes',
		'ingredients',
		'steps',
		'tags',
		'diet_labels',
		'equipment',
		'kcal',
		'protein_g',
		'fat_g',
		'carbs_g',
		'cost_pln',
		'hero_image',
		'photos',
		'foodia_recipe'
	];
	const rows = subs.map((s) => {
		const r = s.recipe;
		const hero = fuwKeyFromUrl(r.heroImage);
		return [
			s.id,
			s.status,
			s.submittedAt,
			s.authorName,
			affiliationLabel(s.affiliation, 'pl'),
			s.affiliationDetail,
			s.email,
			r.sourceLocale ?? 'pl',
			r.name,
			r.summary,
			r.description,
			s.story,
			r.timeMinutes,
			r.ingredients.map((i) => `${i.quantity} ${i.unit} ${i.name}`.replace(/\s+/g, ' ').trim()).join('\n'),
			r.steps.map((st, i) => `${i + 1}. ${st.text}${st.durationMinutes ? ` (${st.durationMinutes} min)` : ''}`).join('\n'),
			r.tags.join(', '),
			r.dietFlags.join(', '),
			r.requiredEquipment.join(', '),
			r.macros.kcal,
			r.macros.proteinG,
			r.macros.fatG,
			r.macros.carbsG,
			r.costEstimate?.amount ?? '',
			hero ? media(hero) : r.heroImage,
			s.photoKeys.map(media).join('\n'),
			s.promotedRecipeId ? `${origin}/recipes/${s.promotedRecipeId}` : ''
		]
			.map(csvCell)
			.join(',');
	});
	// BOM so Excel opens Polish characters as UTF-8 instead of mojibake.
	return '﻿' + [header.join(','), ...rows].join('\r\n') + '\r\n';
}
