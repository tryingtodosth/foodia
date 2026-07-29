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
				return {
					id: c.id,
					target: { type: c.targetType, id: c.targetId },
					content: c.content,
					visibility: c.visibility,
					author: commentAuthor,
					reactions: { upCount: c.upCount, downCount: c.downCount, currentUserReaction: null },
					createdAt: c.createdAt
				};
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

export function createDbApiClient(db: Db): RecipeApiClient {
	return {
		async list() {
			const [recipeRows, users] = await Promise.all([db.select().from(schema.recipes), loadUserMap(db)]);
			const details = await Promise.all(recipeRows.map((r) => assembleRecipeDetail(db, r, users)));
			return details.map(toCard);
		},
		async listDetails() {
			const [recipeRows, users] = await Promise.all([db.select().from(schema.recipes), loadUserMap(db)]);
			return Promise.all(recipeRows.map((r) => assembleRecipeDetail(db, r, users)));
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
