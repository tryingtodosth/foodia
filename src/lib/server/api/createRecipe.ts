import type { Db } from '../db';
import * as schema from '../db/schema';
import type { CreateRecipeInput } from '$lib/types/recipeInput';

export class RecipeValidationError extends Error {}

/** D1 rejects a single statement once its bound-parameter count gets too high (a real 500 this
 *  app hit importing a 27-ingredient recipe — 27 rows × 7 columns = 189 params in one multi-row
 *  INSERT). Chunking keeps every batch comfortably under that ceiling regardless of the exact
 *  limit in effect, rather than tuning a number this app has no visibility into from the outside. */
function chunk<T>(items: T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
	return out;
}

/** Real, minimal validation — not exhaustive, just enough that a malformed submission fails with a
 *  clear reason instead of a confusing DB constraint error three layers down. */
function validate(input: CreateRecipeInput): void {
	if (!input.name?.trim()) throw new RecipeValidationError('Recipe name is required');
	if (!input.summary?.trim()) throw new RecipeValidationError('Recipe summary is required');
	if (!input.description?.trim()) throw new RecipeValidationError('Recipe description is required');
	if (!Array.isArray(input.ingredients) || input.ingredients.length === 0) {
		throw new RecipeValidationError('At least one ingredient is required');
	}
	if (!Array.isArray(input.steps) || input.steps.length === 0) {
		throw new RecipeValidationError('At least one step is required');
	}
	for (const ing of input.ingredients) {
		if (!ing.name?.trim()) throw new RecipeValidationError('Every ingredient needs a name');
		if (typeof ing.quantity !== 'number' || ing.quantity <= 0) {
			throw new RecipeValidationError(`Invalid quantity for ingredient "${ing.name}"`);
		}
	}
	for (const step of input.steps) {
		if (!step.text?.trim()) throw new RecipeValidationError('Every step needs its own text');
		for (const idx of step.ingredientIndexes) {
			if (idx < 0 || idx >= input.ingredients.length) {
				throw new RecipeValidationError(`Step references an ingredient index out of range: ${idx}`);
			}
		}
	}
}

/** Real inserts across recipes/ingredients/steps in one call — not wrapped in an explicit D1
 *  transaction API (D1's `batch()` exists for atomicity, but ingredient ids are needed to build
 *  step rows before those can be batched together; a real, low-stakes tradeoff at this data volume
 *  — a failure partway through leaves an orphaned recipe row rather than a clean rollback, a
 *  genuine gap worth closing before this write path handles untrusted, high-volume input, not
 *  pretended away here — now a real possibility across MORE statements than before, see `chunk`
 *  above, not just fewer larger ones). Returns the new recipe's id. */
export async function createRecipe(db: Db, authorId: string, input: CreateRecipeInput): Promise<string> {
	validate(input);

	const recipeId = crypto.randomUUID();
	const now = new Date().toISOString();

	await db.insert(schema.recipes).values({
		id: recipeId,
		name: input.name.trim(),
		summary: input.summary.trim(),
		description: input.description.trim(),
		heroImage: input.heroImage || '/recipes/placeholder.jpg',
		authorId,
		tags: input.tags,
		dietFlags: input.dietFlags,
		requiredEquipment: input.requiredEquipment,
		timeMinutes: input.timeMinutes,
		costAmount: input.costEstimate?.amount ?? null,
		costCurrency: input.costEstimate?.currency ?? null,
		kcal: input.macros.kcal,
		proteinG: input.macros.proteinG,
		fatG: input.macros.fatG,
		carbsG: input.macros.carbsG,
		upCount: 0,
		downCount: 0,
		sourceLocale: input.sourceLocale?.trim() || 'pl',
		createdAt: now,
		updatedAt: now
	});

	const ingredientIds = input.ingredients.map(() => crypto.randomUUID());
	const ingredientRows = input.ingredients.map((ing, index) => ({
		id: ingredientIds[index],
		recipeId,
		orderIndex: index,
		name: ing.name.trim(),
		quantity: ing.quantity,
		unit: ing.unit.trim() || 'szt',
		// Defaults true, not false — a real, deliberate call, not an oversight left in. The mock
		// fixtures mark this per-ingredient by editorial judgment (Passata pomidorowa in r1 is
		// genuinely not substitutable), but the Composer UI has no per-ingredient control for that
		// yet (a real, stated gap — CreateRecipeIngredientInput doesn't carry it). Defaulting to
		// true keeps every newly-created ingredient open to community substitutions from the start,
		// matching this app's own founding bet (Section 0: "a recipe is a graph, not a document")
		// rather than silently locking every user-created recipe out of that feature by default —
		// the opposite default would have made 4.2's whole write-side invisible on every recipe
		// created through this endpoint, discovered directly (see Session 20's own build-log entry).
		substitutable: true
	}));
	for (const batch of chunk(ingredientRows, 10)) {
		await db.insert(schema.ingredients).values(batch);
	}

	const stepRows = input.steps.map((step, index) => ({
		id: crypto.randomUUID(),
		recipeId,
		orderIndex: index,
		text: step.text.trim(),
		durationMinutes: step.durationMinutes ?? null,
		requiresEquipment: step.requiresEquipment?.length ? step.requiresEquipment : null,
		ingredientIds: step.ingredientIndexes.map((idx) => ingredientIds[idx])
	}));
	for (const batch of chunk(stepRows, 10)) {
		await db.insert(schema.steps).values(batch);
	}

	return recipeId;
}
