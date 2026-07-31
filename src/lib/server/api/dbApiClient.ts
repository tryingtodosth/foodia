// The real `RecipeApiClient` implementation (CLAUDE.md Section 5) — D1-backed, reassembling the
// nested RecipeCard/RecipeDetail shape from the normalized tables. Deliberately implements the
// SAME interface `mockApiClient` already does, not a parallel one — every existing `+page.server.ts`
// call site swaps from `mockApiClient` to `createDbApiClient(getDb(platform))` and needs no other
// change, exactly the "one-line change at the composition root" Section 5 was written to promise.
//
// Server-only (lives under lib/server/) — this file talks to D1 directly and must never reach a
// browser bundle. `lib/api/http.ts`'s `httpApiClient` is the client-safe counterpart for the one
// call site that genuinely runs in the browser (`/shopping-list`), fetching from the `/api/recipes`
// routes this file's own logic backs.
import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db';
import * as schema from '../db/schema';
import type { RecipeApiClient } from '$lib/api/client';
import type {
	RecipeCard,
	RecipeDetail,
	Ingredient,
	Substitution,
	Step,
	StepAlternative,
	RecipeVersion,
	NodeComment,
	Translation,
	UserRef
} from '$lib/types/recipe';

type UserRow = typeof schema.users.$inferSelect;

function toUserRef(row: UserRow): UserRef {
	return { id: row.id, displayName: row.displayName, avatarUrl: row.avatarUrl };
}

/** One place that turns a `comments` row into the client-facing shape, shared by both assembly
 *  paths below (per-recipe and the bulk one) so a rule like "a removed comment's text never
 *  leaves the server" can't hold in one and be forgotten in the other — which is exactly how the
 *  Session 20 private-comment leak happened in the first place. */
function toNodeComment(row: typeof schema.comments.$inferSelect, author: UserRef): NodeComment {
	const removed = row.removedAt !== null;
	return {
		id: row.id,
		target: { type: row.targetType, id: row.targetId },
		// Blanked here, at the boundary, rather than hidden by the component that renders it: the
		// row keeps its text in D1 (an admin has to be able to review/undo a removal), but a viewer
		// gets the tombstone flag and nothing else.
		content: removed ? '' : row.content,
		visibility: row.visibility,
		author,
		reactions: { upCount: row.upCount, downCount: row.downCount, currentUserReaction: null },
		createdAt: row.createdAt,
		removed: removed ? true : undefined
	};
}

/** Loads every user once and resolves refs from an in-memory map — this app has a handful of
 *  users, not millions; a real per-recipe author/proposer JOIN chain would be several joins deep
 *  for very little benefit at this scale. Revisit if the user table ever stops being small. */
async function loadUserMap(db: Db): Promise<Map<string, UserRef>> {
	const rows = await db.select().from(schema.users);
	return new Map(rows.map((r) => [r.id, toUserRef(r)]));
}

async function assembleRecipeDetail(
	db: Db,
	recipeRow: typeof schema.recipes.$inferSelect,
	users: Map<string, UserRef>
): Promise<RecipeDetail> {
	const author = users.get(recipeRow.authorId);
	if (!author) throw new Error(`Recipe ${recipeRow.id} references unknown author ${recipeRow.authorId}`);

	const [ingredientRows, stepRows, versionRows, commentRows, translationRows] = await Promise.all([
		db.select().from(schema.ingredients).where(eq(schema.ingredients.recipeId, recipeRow.id)).orderBy(schema.ingredients.orderIndex),
		db.select().from(schema.steps).where(eq(schema.steps.recipeId, recipeRow.id)).orderBy(schema.steps.orderIndex),
		db.select().from(schema.recipeVersions).where(eq(schema.recipeVersions.recipeId, recipeRow.id)),
		// `visibility = 'public'` filtered in the query itself, not after — a private comment is
		// "visible only to its author, never synced to others" (CommentItem.svelte's own header
		// comment), a promise that held for free in the mock era (a private note lived only in that
		// browser's own sessionComments, never sent anywhere) but is a real, live privacy leak the
		// instant comments are shared, multi-user D1 rows: nothing here knows who's asking, so the
		// only currently-safe answer is "nobody but the mock era's own implicit 'just me' ever sees
		// one" — every visitor gets the public thread, never anyone else's private notes, full stop.
		// A real, stated follow-up: this also currently hides an author's own private notes from
		// themselves once server-rendered (no viewer identity threaded through this read path yet)
		// — a real gap, but a strictly smaller and safer one than the leak this closes.
		db.select().from(schema.comments).where(
			and(eq(schema.comments.recipeId, recipeRow.id), eq(schema.comments.visibility, 'public'))
		),
		db.select().from(schema.translations).where(eq(schema.translations.recipeId, recipeRow.id))
	]);

	const ingredientIds = ingredientRows.map((i) => i.id);
	const stepIds = stepRows.map((s) => s.id);

	const [subRows, altRows] = await Promise.all([
		ingredientIds.length
			? db.select().from(schema.substitutions).where(inArray(schema.substitutions.forIngredientId, ingredientIds))
			: Promise.resolve([]),
		stepIds.length
			? db.select().from(schema.stepAlternatives).where(inArray(schema.stepAlternatives.forStepId, stepIds))
			: Promise.resolve([])
	]);

	const subsByIngredient = new Map<string, Substitution[]>();
	for (const s of subRows) {
		const sub: Substitution = {
			id: s.id,
			forIngredientId: s.forIngredientId,
			name: s.name,
			ratio: s.ratio,
			deltaMacros: s.deltaMacros ?? undefined,
			reactions: { upCount: s.upCount, downCount: s.downCount, currentUserReaction: null },
			source: s.source,
			proposedBy: s.proposedById ? users.get(s.proposedById) : undefined
		};
		const list = subsByIngredient.get(s.forIngredientId) ?? [];
		list.push(sub);
		subsByIngredient.set(s.forIngredientId, list);
	}

	const altsByStep = new Map<string, StepAlternative[]>();
	for (const a of altRows) {
		const alt: StepAlternative = {
			id: a.id,
			forStepId: a.forStepId,
			text: a.text,
			requiresEquipment: a.requiresEquipment ?? undefined,
			durationMinutes: a.durationMinutes ?? undefined,
			triggeredBySubstitutionId: a.triggeredBySubstitutionId ?? undefined,
			reactions: { upCount: a.upCount, downCount: a.downCount, currentUserReaction: null },
			source: a.source,
			proposedBy: a.proposedById ? users.get(a.proposedById) : undefined
		};
		const list = altsByStep.get(a.forStepId) ?? [];
		list.push(alt);
		altsByStep.set(a.forStepId, list);
	}

	const ingredients: Ingredient[] = ingredientRows.map((i) => ({
		id: i.id,
		name: i.name,
		quantity: i.quantity,
		unit: i.unit,
		substitutable: i.substitutable,
		substitutions: subsByIngredient.get(i.id)
	}));

	const steps: Step[] = stepRows.map((s, index) => ({
		id: s.id,
		order: index + 1,
		text: s.text,
		durationMinutes: s.durationMinutes ?? undefined,
		requiresEquipment: s.requiresEquipment ?? undefined,
		ingredientIds: s.ingredientIds,
		alternatives: altsByStep.get(s.id)
	}));

	const versions: RecipeVersion[] | undefined = versionRows.length
		? versionRows.map((v) => ({ id: v.id.split('::')[1] ?? v.id, label: v.label, parentRecipeId: v.parentRecipeId }))
		: undefined;

	const comments: NodeComment[] | undefined = commentRows.length
		? commentRows.map((c) => {
				const commentAuthor = users.get(c.authorId);
				if (!commentAuthor) throw new Error(`Comment ${c.id} references unknown author ${c.authorId}`);
				return toNodeComment(c, commentAuthor);
			})
		: undefined;

	const translations: Translation[] | undefined = translationRows.length
		? translationRows.map((t) => {
				const translator = users.get(t.translatedById);
				if (!translator) throw new Error(`Translation ${t.id} references unknown translator ${t.translatedById}`);
				return {
					id: t.id,
					recipeId: t.recipeId,
					locale: t.locale,
					fields: t.fields,
					translatedBy: translator,
					reactions: { upCount: t.upCount, downCount: t.downCount, currentUserReaction: null },
					createdAt: t.createdAt
				};
			})
		: undefined;

	return {
		id: recipeRow.id,
		name: recipeRow.name,
		summary: recipeRow.summary,
		description: recipeRow.description,
		heroImage: recipeRow.heroImage,
		author,
		tags: recipeRow.tags,
		dietFlags: recipeRow.dietFlags,
		requiredEquipment: recipeRow.requiredEquipment,
		timeMinutes: recipeRow.timeMinutes,
		costEstimate:
			recipeRow.costAmount !== null && recipeRow.costCurrency !== null
				? { amount: recipeRow.costAmount, currency: recipeRow.costCurrency }
				: undefined,
		macros: {
			kcal: recipeRow.kcal,
			proteinG: recipeRow.proteinG,
			fatG: recipeRow.fatG,
			carbsG: recipeRow.carbsG
		},
		reactions: { upCount: recipeRow.upCount, downCount: recipeRow.downCount, currentUserReaction: null },
		createdAt: recipeRow.createdAt,
		updatedAt: recipeRow.updatedAt,
		sourceLocale: recipeRow.sourceLocale ?? undefined,
		ingredients,
		steps,
		versions,
		comments,
		translations
	};
}

/** Same derivation `mockApiClient`'s own `toCard` already does — a Card is a Detail with the
 *  Detail-only fields stripped, not a separately-stored/queried shape. Kept as a plain object
 *  destructure for the identical reason: one source of truth for what "Card-only" means. */
function toCard(detail: RecipeDetail): RecipeCard {
	const { ingredients, steps, versions, comments, translations, description, ...card } = detail;
	return card;
}

function groupBy<T, K>(rows: T[], key: (row: T) => K): Map<K, T[]> {
	const map = new Map<K, T[]>();
	for (const row of rows) {
		const k = key(row);
		const list = map.get(k) ?? [];
		list.push(row);
		map.set(k, list);
	}
	return map;
}

/** `assembleRecipeDetail` above does exactly the right thing for ONE recipe: N parallel queries,
 *  fine when N is a handful. `list()`/`listDetails()` need EVERY recipe though, and calling that
 *  function once per row turns into 7 queries × recipe count — 469 real D1 subrequests for this
 *  app's own 67 seeded recipes, invisible against local Miniflare's in-process SQLite (basically
 *  free) but a genuine hang against real D1 (a live, production-only bug this app hit on its own
 *  first real Cloudflare deploy — CLAUDE.md Session 21). This does the same assembly with the
 *  query count held constant regardless of recipe count: one bulk, unfiltered `select()` per
 *  table (this app has no pagination yet — every table is small enough to load whole), then the
 *  exact same per-row field mapping `assembleRecipeDetail` uses, grouped in-memory instead of
 *  re-fetched per recipe. `getDetail`/`getManyDetails` keep the simpler per-recipe path — a
 *  handful of ids has no N+1 problem worth this bulk machinery. */
async function assembleAllRecipeDetails(db: Db): Promise<RecipeDetail[]> {
	const [recipeRows, users, ingredientRows, stepRows, versionRows, commentRows, translationRows] =
		await Promise.all([
			db.select().from(schema.recipes),
			loadUserMap(db),
			db.select().from(schema.ingredients).orderBy(schema.ingredients.orderIndex),
			db.select().from(schema.steps).orderBy(schema.steps.orderIndex),
			db.select().from(schema.recipeVersions),
			db.select().from(schema.comments).where(eq(schema.comments.visibility, 'public')),
			db.select().from(schema.translations)
		]);

	const [subRows, altRows] = await Promise.all([
		db.select().from(schema.substitutions),
		db.select().from(schema.stepAlternatives)
	]);

	const ingredientsByRecipe = groupBy(ingredientRows, (i) => i.recipeId);
	const stepsByRecipe = groupBy(stepRows, (s) => s.recipeId);
	const versionsByRecipe = groupBy(versionRows, (v) => v.recipeId);
	const commentsByRecipe = groupBy(commentRows, (c) => c.recipeId);
	const translationsByRecipe = groupBy(translationRows, (t) => t.recipeId);
	const subsByIngredient = groupBy(subRows, (s) => s.forIngredientId);
	const altsByStep = groupBy(altRows, (a) => a.forStepId);

	return recipeRows.map((recipeRow) => {
		const author = users.get(recipeRow.authorId);
		if (!author) throw new Error(`Recipe ${recipeRow.id} references unknown author ${recipeRow.authorId}`);

		const ingredients: Ingredient[] = (ingredientsByRecipe.get(recipeRow.id) ?? []).map((i) => ({
			id: i.id,
			name: i.name,
			quantity: i.quantity,
			unit: i.unit,
			substitutable: i.substitutable,
			substitutions: (subsByIngredient.get(i.id) ?? []).map((s) => ({
				id: s.id,
				forIngredientId: s.forIngredientId,
				name: s.name,
				ratio: s.ratio,
				deltaMacros: s.deltaMacros ?? undefined,
				reactions: { upCount: s.upCount, downCount: s.downCount, currentUserReaction: null },
				source: s.source,
				proposedBy: s.proposedById ? users.get(s.proposedById) : undefined
			}))
		}));

		const steps: Step[] = (stepsByRecipe.get(recipeRow.id) ?? []).map((s, index) => ({
			id: s.id,
			order: index + 1,
			text: s.text,
			durationMinutes: s.durationMinutes ?? undefined,
			requiresEquipment: s.requiresEquipment ?? undefined,
			ingredientIds: s.ingredientIds,
			alternatives: (altsByStep.get(s.id) ?? []).map((a) => ({
				id: a.id,
				forStepId: a.forStepId,
				text: a.text,
				requiresEquipment: a.requiresEquipment ?? undefined,
				durationMinutes: a.durationMinutes ?? undefined,
				triggeredBySubstitutionId: a.triggeredBySubstitutionId ?? undefined,
				reactions: { upCount: a.upCount, downCount: a.downCount, currentUserReaction: null },
				source: a.source,
				proposedBy: a.proposedById ? users.get(a.proposedById) : undefined
			}))
		}));

		const recipeVersionRows = versionsByRecipe.get(recipeRow.id) ?? [];
		const versions: RecipeVersion[] | undefined = recipeVersionRows.length
			? recipeVersionRows.map((v) => ({ id: v.id.split('::')[1] ?? v.id, label: v.label, parentRecipeId: v.parentRecipeId }))
			: undefined;

		const recipeCommentRows = commentsByRecipe.get(recipeRow.id) ?? [];
		const comments: NodeComment[] | undefined = recipeCommentRows.length
			? recipeCommentRows.map((c) => {
					const commentAuthor = users.get(c.authorId);
					if (!commentAuthor) throw new Error(`Comment ${c.id} references unknown author ${c.authorId}`);
					return toNodeComment(c, commentAuthor);
				})
			: undefined;

		const recipeTranslationRows = translationsByRecipe.get(recipeRow.id) ?? [];
		const translations: Translation[] | undefined = recipeTranslationRows.length
			? recipeTranslationRows.map((t) => {
					const translator = users.get(t.translatedById);
					if (!translator) throw new Error(`Translation ${t.id} references unknown translator ${t.translatedById}`);
					return {
						id: t.id,
						recipeId: t.recipeId,
						locale: t.locale,
						fields: t.fields,
						translatedBy: translator,
						reactions: { upCount: t.upCount, downCount: t.downCount, currentUserReaction: null },
						createdAt: t.createdAt
					};
				})
			: undefined;

		return {
			id: recipeRow.id,
			name: recipeRow.name,
			summary: recipeRow.summary,
			description: recipeRow.description,
			heroImage: recipeRow.heroImage,
			author,
			tags: recipeRow.tags,
			dietFlags: recipeRow.dietFlags,
			requiredEquipment: recipeRow.requiredEquipment,
			timeMinutes: recipeRow.timeMinutes,
			costEstimate:
				recipeRow.costAmount !== null && recipeRow.costCurrency !== null
					? { amount: recipeRow.costAmount, currency: recipeRow.costCurrency }
					: undefined,
			macros: {
				kcal: recipeRow.kcal,
				proteinG: recipeRow.proteinG,
				fatG: recipeRow.fatG,
				carbsG: recipeRow.carbsG
			},
			reactions: { upCount: recipeRow.upCount, downCount: recipeRow.downCount, currentUserReaction: null },
			createdAt: recipeRow.createdAt,
			updatedAt: recipeRow.updatedAt,
			sourceLocale: recipeRow.sourceLocale ?? undefined,
			ingredients,
			steps,
			versions,
			comments,
			translations
		};
	});
}

export function createDbApiClient(db: Db): RecipeApiClient {
	return {
		async list() {
			const details = await assembleAllRecipeDetails(db);
			return details.map(toCard);
		},
		async listDetails() {
			return assembleAllRecipeDetails(db);
		},
		async getCard(id: string) {
			return toCard(await this.getDetail(id));
		},
		async getDetail(id: string) {
			const [recipeRow] = await db.select().from(schema.recipes).where(eq(schema.recipes.id, id));
			if (!recipeRow) throw new Error(`Recipe not found: ${id}`);
			const users = await loadUserMap(db);
			return assembleRecipeDetail(db, recipeRow, users);
		},
		async getManyDetails(ids: string[]) {
			const unique = [...new Set(ids)];
			if (unique.length === 0) return [];
			const [recipeRows, users] = await Promise.all([
				db.select().from(schema.recipes).where(inArray(schema.recipes.id, unique)),
				loadUserMap(db)
			]);
			return Promise.all(recipeRows.map((r) => assembleRecipeDetail(db, r, users)));
		}
	};
}
