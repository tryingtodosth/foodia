// The E-Grocery aggregation (CLAUDE.md 4.5): cross-references a week's assigned meals against the
// Pantry to produce a "missing items" list. Pure, framework-agnostic functions — no Svelte import,
// same discipline `substitution.ts`/`hardware.ts`/`week.ts` already follow, so this stays easy to
// exercise directly if real tests ever get added.
import type { RecipeDetail } from '$lib/types/recipe';
import type { MealPlan, PantryItem } from '$lib/types/pantry';

export interface AggregatedIngredient {
	key: string; // `${name}::${unit}`, lowercased — the compound grouping key
	name: string;
	unit: string;
	neededQuantity: number;
	usedInRecipeNames: string[]; // deduped, for the "used in: X, Y" traceability line
}

export interface ShoppingListItem extends AggregatedIngredient {
	pantryQuantity: number;
	missingQuantity: number;
	/** Pantry has this ingredient by name, but in a different unit — can't safely subtract
	 *  (unit conversion is ingredient-density-dependent, CLAUDE.md 7 item 3, not solved here).
	 *  Shown at full `neededQuantity` in the missing list with this flag so the shopper isn't
	 *  silently told to buy something they may partly already have. */
	partiallyCoveredDifferentUnit: boolean;
}

/**
 * Sums every ingredient across every assigned meal-slot in a MealPlan. Needs the full
 * RecipeDetail — Card-level data has no `ingredients` array. Deliberately NOT scaled by
 * `MealSlot.servings`: Recipe has no `baseServings` field to scale against, the same known gap
 * `/plan`'s own budget math already flags (CLAUDE.md 6.2) — kept consistent rather than
 * introducing a second, different simplification for the same missing field.
 *
 * Grouped by (name, unit) — an ingredient with the same name but a different unit across two
 * recipes becomes two separate line items, never silently summed (unit conversion is
 * ingredient-density-dependent, Section 7 item 3 — not attempted here).
 */
export function aggregateIngredients(
	plan: MealPlan,
	recipesById: Record<string, RecipeDetail>
): AggregatedIngredient[] {
	const byKey = new Map<string, AggregatedIngredient>();

	for (const day of plan.days) {
		for (const meal of day.meals) {
			const recipe = recipesById[meal.recipeId];
			if (!recipe) continue;
			for (const ingredient of recipe.ingredients) {
				const key = `${ingredient.name.trim().toLowerCase()}::${ingredient.unit.trim().toLowerCase()}`;
				const existing = byKey.get(key);
				if (existing) {
					existing.neededQuantity += ingredient.quantity;
					if (!existing.usedInRecipeNames.includes(recipe.name)) {
						existing.usedInRecipeNames.push(recipe.name);
					}
				} else {
					byKey.set(key, {
						key,
						name: ingredient.name,
						unit: ingredient.unit,
						neededQuantity: ingredient.quantity,
						usedInRecipeNames: [recipe.name]
					});
				}
			}
		}
	}

	return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name, 'pl'));
}

/** Cross-references aggregated needs against the Pantry — see `AggregatedIngredient`'s own note on
 *  why a name match with a different unit can't be safely subtracted; flagged per-item instead. */
export function crossReferencePantry(
	needed: AggregatedIngredient[],
	pantry: PantryItem[]
): ShoppingListItem[] {
	return needed.map((item) => {
		const sameNameItems = pantry.filter(
			(p) => p.ingredientName.trim().toLowerCase() === item.name.trim().toLowerCase()
		);
		const sameUnitMatch = sameNameItems.find(
			(p) => p.unit.trim().toLowerCase() === item.unit.trim().toLowerCase()
		);
		const pantryQuantity = sameUnitMatch?.quantity ?? 0;
		const missingQuantity = Math.max(0, item.neededQuantity - pantryQuantity);
		return {
			...item,
			pantryQuantity,
			missingQuantity,
			partiallyCoveredDifferentUnit: sameNameItems.length > 0 && !sameUnitMatch
		};
	});
}
