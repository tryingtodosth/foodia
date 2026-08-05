// "Do I already have this?" for ONE ingredient, answered against the Pantry — the question the
// ingredient sheet opens on, and the same question `/shopping-list` already answers for a whole
// week's plan.
//
// Deliberately built ON TOP of `crossReferencePantry` (shoppingList.ts) rather than beside it: that
// function already resolves every real case here (same unit, convertible unit, cross-family pair
// needing a density, genuinely incompatible units) and is already exercised by
// `scripts/verify-units.ts`. A second, simpler copy of that logic would drift from it the first
// time either side learned a new unit — and would answer "you have this" differently on the
// ingredient sheet than on the shopping list, which is exactly the kind of contradiction that
// makes a pantry feature untrustworthy.
import type { Ingredient } from '$lib/types/recipe';
import type { PantryItem } from '$lib/types/pantry';
import type { DensityClass } from '$lib/types/units';
import { crossReferencePantry, type UnitMatchStatus } from './shoppingList';

/**
 * - `none` — nothing in the pantry under this name at all.
 * - `enough` — the pantry covers the full amount this recipe asks for.
 * - `partial` — some of it is there, not all.
 * - `unresolved` — rows exist under this name but their units can't be compared to the recipe's
 *   (a cross-family pair with no density answered yet, or a genuinely unconvertible unit like
 *   "clove" vs "g"). Never reported as `none`: "you don't have any" and "I can't tell how much you
 *   have" are different answers, and only the second one is worth asking the cook about.
 */
export type PantryCoverage = 'none' | 'enough' | 'partial' | 'unresolved';

export interface PantryStatus {
	coverage: PantryCoverage;
	/** How much of the recipe's own unit the pantry covers — real converted quantities, not raw
	 *  pantry numbers in whatever unit they happened to be logged in. */
	haveQuantity: number;
	/** What's still missing, in the recipe's own unit. 0 when `enough`. */
	missingQuantity: number;
	/** The pantry rows that carry this ingredient name, whatever unit they're in — shown as-is so
	 *  the cook can see WHY an unresolved answer is unresolved. */
	matchingItems: PantryItem[];
	unitStatus: UnitMatchStatus;
}

export function pantryStatusFor(
	ingredient: Pick<Ingredient, 'name' | 'quantity' | 'unit'>,
	pantry: PantryItem[],
	densityFor: (ingredientName: string) => DensityClass | undefined = () => undefined
): PantryStatus {
	const nameKey = ingredient.name.trim().toLowerCase();
	const matchingItems = pantry.filter((p) => p.ingredientName.trim().toLowerCase() === nameKey);

	const [result] = crossReferencePantry(
		[
			{
				key: `${nameKey}::${ingredient.unit.trim().toLowerCase()}`,
				name: ingredient.name,
				unit: ingredient.unit,
				neededQuantity: ingredient.quantity,
				usedInRecipeNames: []
			}
		],
		pantry,
		densityFor
	);

	let coverage: PantryCoverage;
	if (matchingItems.length === 0) {
		coverage = 'none';
	} else if (result.unitStatus === 'needsDensity' || result.unitStatus === 'incompatible') {
		// A pantry holding BOTH a convertible row and an unresolved one still reports `unresolved`
		// — the same call `crossReferencePantry` itself makes for the same reason: claiming
		// "partial" here would quietly drop the row nobody can measure yet and never ask the one
		// question that would recover it.
		coverage = 'unresolved';
	} else if (result.missingQuantity <= 0) {
		coverage = 'enough';
	} else if (result.pantryQuantity > 0) {
		coverage = 'partial';
	} else {
		coverage = 'none';
	}

	return {
		coverage,
		haveQuantity: result.pantryQuantity,
		missingQuantity: result.missingQuantity,
		matchingItems,
		unitStatus: result.unitStatus
	};
}
