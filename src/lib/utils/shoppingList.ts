// The E-Grocery aggregation (CLAUDE.md 4.5): cross-references a week's assigned meals against the
// Pantry to produce a "missing items" list. Pure, framework-agnostic functions — no Svelte import,
// same discipline `substitution.ts`/`hardware.ts`/`week.ts` already follow, so this stays easy to
// exercise directly (see `scripts/verify-units.ts`'s own sibling verification for `units.ts`).
import type { RecipeDetail } from '$lib/types/recipe';
import type { MealPlan, PantryItem } from '$lib/types/pantry';
import type { DensityClass } from '$lib/types/units';
import { DENSITY_CLASS_G_PER_ML } from '$lib/types/units';
import { convertQuantity, familyOf, normalizeUnit } from '$lib/utils/units';

export interface AggregatedIngredient {
	key: string; // `${name}::${unit}`, lowercased — the compound grouping key
	name: string;
	unit: string;
	neededQuantity: number;
	usedInRecipeNames: string[]; // deduped, for the "used in: X, Y" traceability line
}

/** Real unit conversion (CLAUDE.md 4.5/4.7, Session 25) replaces the old flat "different unit,
 *  can't compare" — four genuinely different real situations, not one:
 *  - `match`: the pantry row is already in the exact unit needed, straight subtraction.
 *  - `converted`: a different unit, but real math resolved it — same-family arithmetic (g<->oz) or
 *    cross-family via a cached `DensityClass` (cup<->g) — `pantryQuantity` is the real converted
 *    number, not the pantry row's own raw one.
 *  - `needsDensity`: the pantry row is a genuine cross-family mismatch (mass vs. volume) and no
 *    `DensityClass` is cached yet for this ingredient — real, resolvable ambiguity, surfaced to
 *    the cook to answer once rather than guessed at.
 *  - `incompatible`: the units involved aren't convertible at all (e.g. "clove" vs. "g") — no
 *    density could ever bridge these, same honest dead end the old flag represented. */
export type UnitMatchStatus = 'match' | 'converted' | 'needsDensity' | 'incompatible';

export interface ShoppingListItem extends AggregatedIngredient {
	pantryQuantity: number;
	missingQuantity: number;
	unitStatus: UnitMatchStatus;
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

/** Cross-references aggregated needs against the Pantry, converting real units where real math
 *  allows it. `densityFor` is injected, not imported directly — this stays a pure function, the
 *  caller supplies a lookup into it (`ingredientDensityStore.classFor`, in practice), the same "no
 *  store imports in a utils file" discipline this file has always followed. A pantry can hold more
 *  than one row for the same ingredient name in different units (nothing forces a merge at
 *  add-time for a cross-family pair with no density cached yet) — every convertible row's quantity
 *  is summed, not just the first match. */
export function crossReferencePantry(
	needed: AggregatedIngredient[],
	pantry: PantryItem[],
	densityFor: (ingredientName: string) => DensityClass | undefined = () => undefined
): ShoppingListItem[] {
	return needed.map((item) => {
		const sameNameItems = pantry.filter(
			(p) => p.ingredientName.trim().toLowerCase() === item.name.trim().toLowerCase()
		);

		let pantryQuantity = 0;
		let anyConverted = false;
		let anyNeedsDensity = false;
		let anyIncompatible = false;

		// Looked up once per ingredient, not once per pantry row — the class is keyed by ingredient
		// name, so every row for this ingredient resolves to the same density regardless.
		const densityClass = densityFor(item.name);
		const densityGPerMl = densityClass ? DENSITY_CLASS_G_PER_ML[densityClass] : undefined;

		for (const row of sameNameItems) {
			const converted = convertQuantity(row.quantity, row.unit, item.unit, densityGPerMl);
			if (converted !== null) {
				pantryQuantity += converted;
				if (normalizeUnit(row.unit) !== normalizeUnit(item.unit)) anyConverted = true;
				continue;
			}
			// Conversion failed — real math couldn't bridge these two units. Distinguish WHY: a
			// genuine cross-family pair (mass vs. volume) missing only a density class is a real,
			// resolvable question; either side being an 'other'-family unit (a count/descriptor like
			// "clove") is not resolvable by any density, ever.
			const rowFamily = familyOf(row.unit);
			const neededFamily = familyOf(item.unit);
			if (rowFamily !== 'other' && neededFamily !== 'other' && rowFamily !== neededFamily) {
				anyNeedsDensity = true;
			} else {
				anyIncompatible = true;
			}
		}

		const missingQuantity = Math.max(0, item.neededQuantity - pantryQuantity);
		// `needsDensity` outranks a successful conversion on purpose: a pantry can hold BOTH a
		// convertible row and an unresolved cross-family one for the same ingredient ("500 g flour"
		// plus "2 cup flour", needed in grams). Reporting 'converted' there would quietly drop the
		// cup row from the subtraction AND never ask the one question that would recover it — the
		// exact dead end this whole feature exists to remove. `pantryQuantity` still carries
		// whatever genuinely did convert, so answering the prompt only ever adds to the coverage.
		let unitStatus: UnitMatchStatus = 'match';
		if (anyNeedsDensity) {
			unitStatus = 'needsDensity';
		} else if (pantryQuantity > 0 && anyConverted) {
			unitStatus = 'converted';
		} else if (pantryQuantity === 0 && anyIncompatible) {
			unitStatus = 'incompatible';
		}

		return { ...item, pantryQuantity, missingQuantity, unitStatus };
	});
}
