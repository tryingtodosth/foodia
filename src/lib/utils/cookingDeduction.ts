// The missing third leg of the plan -> shopping-list -> pantry loop (CLAUDE.md 4.5, FUTURES.md
// Section 1 item 4, open since Session 7). Planning a week derives a shopping list; buying adds to
// the pantry; **cooking never took anything back out** — `pantryStore.markUsed` deletes a whole row
// by hand, which is a checklist gesture, not a consequence of having cooked something. So the
// pantry drifted stale the moment anyone actually used it, and the shopping list it feeds drifted
// with it.
//
// This is the literal inverse of `crossReferencePantry` (shoppingList.ts): that one asks "given
// what I have, what must I buy"; this one asks "given what I just cooked, what did I spend". Both
// run on the same `units.ts` conversion engine and the same `(name)`-keyed matching, on purpose —
// two different answers to the same pantry question are exactly how a pantry feature stops being
// trusted (`pantryStatus.ts`'s own header comment makes this argument for the same reason).
//
// Pure, framework-agnostic — no Svelte import, `densityFor` injected rather than importing the
// store, same discipline `shoppingList.ts`/`recipeFilter.ts`/`units.ts` already follow.
import type { Ingredient } from '$lib/types/recipe';
import type { PantryItem } from '$lib/types/pantry';
import type { DensityClass } from '$lib/types/units';
import { DENSITY_CLASS_G_PER_ML } from '$lib/types/units';
import type {
	CookingDeductionPlan,
	CookingShortfall,
	CookingSubstitutionChoice,
	PantryDeduction
} from '$lib/types/cooking';
import { convertQuantity } from '$lib/utils/units';

/** Below this, a remainder is float noise from a conversion round-trip, not a real shortage —
 *  reporting "you were short 0.0000000003 g of salt" would be worse than saying nothing. */
const EPSILON = 1e-6;

/**
 * What a recipe's ingredient list really means once the cook has swapped things mid-recipe: the
 * replacement's name, and the original quantity scaled by that substitution's own `ratio` (Section
 * 3 defines `ratio` as exactly that — "conversion factor against the original quantity"). Exported
 * because Cooking Mode shows the same resolved values on screen while cooking, and the amount shown
 * to the cook and the amount taken off the pantry must be one computation, not two.
 */
export function effectiveIngredient(
	ingredient: Pick<Ingredient, 'id' | 'name' | 'quantity' | 'unit'>,
	substitutions: Record<string, CookingSubstitutionChoice>
): { name: string; quantity: number; unit: string; swappedFrom: string | null } {
	const choice = substitutions[ingredient.id];
	if (!choice) {
		return { name: ingredient.name, quantity: ingredient.quantity, unit: ingredient.unit, swappedFrom: null };
	}
	return {
		name: choice.name,
		quantity: ingredient.quantity * choice.ratio,
		unit: ingredient.unit,
		swappedFrom: ingredient.name
	};
}

/**
 * Works out what to subtract from the pantry for one cooked recipe, WITHOUT mutating anything —
 * the caller shows this to the cook first and only applies it on an explicit confirmation. That
 * separation is the point: FUTURES.md's own spec says the deduction should happen "immediately, in
 * the background," and this app's own house rule (never silently rewrite what a cook is looking at)
 * says the opposite. Returning a plan rather than performing one satisfies both — the write is one
 * tap away, and it's fully inspectable before it happens.
 *
 * Three real decisions worth stating, since each rejects a plausible alternative:
 *
 * 1. **Not scaled by `MealSlot.servings`.** Every other quantity in this app is un-prorated for the
 *    same reason (Recipe has no `baseServings` to scale against — `aggregateIngredients`, /plan's
 *    budget total, and its kcal totals all say so already). Here it's not just consistency, it's
 *    correctness: the shopping list that filled this pantry summed un-prorated quantities, so
 *    deducting a servings-scaled amount would spend more than was ever bought and drive the pantry
 *    to a permanent, invented deficit.
 *
 * 2. **Rows are spent oldest-first** (`updatedAt` ascending), not largest-first. That's what a real
 *    pantry does — the older carton goes first — and it means a re-stocked ingredient keeps its
 *    fresh row intact rather than being shaved off the top.
 *
 * 3. **An ingredient with NO pantry row at all is not a shortfall.** The cook demonstrably had it
 *    (they finished the dish); it simply was never logged. Flagging every untracked ingredient as
 *    "you may have been short" would bury the one case FUTURES.md actually specced — a tracked
 *    ingredient whose logged quantity didn't cover the recipe — under noise about salt and pepper.
 */
export function planPantryDeduction(
	ingredients: Pick<Ingredient, 'id' | 'name' | 'quantity' | 'unit'>[],
	substitutions: Record<string, CookingSubstitutionChoice>,
	pantry: PantryItem[],
	densityFor: (ingredientName: string) => DensityClass | undefined = () => undefined
): CookingDeductionPlan {
	const deductions: PantryDeduction[] = [];
	const shortfalls: CookingShortfall[] = [];

	for (const ingredient of ingredients) {
		const used = effectiveIngredient(ingredient, substitutions);
		if (used.quantity <= 0) continue;

		const nameKey = used.name.trim().toLowerCase();
		const rows = pantry
			.filter((row) => row.ingredientName.trim().toLowerCase() === nameKey)
			.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));

		// Nothing logged under this name — see decision 3 above. Silence, not a warning.
		if (rows.length === 0) continue;

		const densityClass = densityFor(used.name);
		const densityGPerMl = densityClass ? DENSITY_CLASS_G_PER_ML[densityClass] : undefined;

		let remaining = used.quantity;
		let anyUnresolved = false;

		for (const row of rows) {
			if (remaining <= EPSILON) break;
			const availableInRecipeUnit = convertQuantity(row.quantity, row.unit, used.unit, densityGPerMl);
			if (availableInRecipeUnit === null || availableInRecipeUnit <= 0) {
				// Real math couldn't bridge this row's unit to the recipe's (a cross-family pair with
				// no density answered yet, or a genuinely unconvertible unit like "ząbki" vs "g").
				// Leave the row completely alone — guessing here would silently destroy real stock.
				if (availableInRecipeUnit === null) anyUnresolved = true;
				continue;
			}

			const takeInRecipeUnit = Math.min(availableInRecipeUnit, remaining);
			// Deducted as a FRACTION of the row rather than by converting the taken amount back —
			// a convert-there-and-back round trip leaves float residue, which would strand rows at
			// 0.0000001 instead of emptying them. A full take is exactly `row.quantity`, by
			// construction, so a row that's fully used up is cleanly removable.
			const fraction = takeInRecipeUnit / availableInRecipeUnit;
			deductions.push({
				pantryItemId: row.id,
				ingredientName: row.ingredientName,
				quantity: row.quantity * fraction,
				unit: row.unit
			});
			remaining -= takeInRecipeUnit;
		}

		if (remaining > EPSILON) {
			// `unresolved` outranks `short` when both apply, the same precedence `crossReferencePantry`
			// gives `needsDensity` over `converted` and for the same reason: telling a cook they ran
			// short, when the truth is that a row couldn't be measured, is a wrong fact rather than a
			// vague one.
			shortfalls.push({
				ingredientName: used.name,
				missingQuantity: anyUnresolved ? 0 : remaining,
				unit: used.unit,
				reason: anyUnresolved ? 'unresolved' : 'short'
			});
		}
	}

	return { deductions, shortfalls };
}
