// Pure conversion engine — no Svelte import, same discipline `shoppingList.ts`/`substitution.ts`/
// `hardware.ts`/`week.ts` already follow, so this stays easy to exercise directly (see
// `scripts/verify-units.ts`). See `lib/types/units.ts` for why same-family and cross-family
// conversion are treated as two genuinely different problems.
import type { UnitFamily, DensityClass } from '$lib/types/units';

/** Every spelling this app's own real content actually uses, collapsed to one canonical string —
 *  Session 24's Budget Bytes import alone produced "Tbsp"/"tbsp"/"tbsp." inconsistently depending
 *  on the source page's own formatting, and a naive (name, unit) key treats each as a different
 *  ingredient. Deliberately a flat lookup, not a regex — unit words don't share a common pattern
 *  worth inferring, and an explicit table is easy to audit and extend. */
const UNIT_ALIASES: Record<string, string> = {
	// mass
	g: 'g',
	gram: 'g',
	grams: 'g',
	kg: 'kg',
	kilogram: 'kg',
	kilograms: 'kg',
	oz: 'oz',
	'oz.': 'oz',
	ounce: 'oz',
	ounces: 'oz',
	lb: 'lb',
	'lb.': 'lb',
	lbs: 'lb',
	'lbs.': 'lb',
	pound: 'lb',
	pounds: 'lb',
	// volume
	ml: 'ml',
	milliliter: 'ml',
	milliliters: 'ml',
	millilitre: 'ml',
	millilitres: 'ml',
	l: 'l',
	liter: 'l',
	liters: 'l',
	litre: 'l',
	litres: 'l',
	cup: 'cup',
	cups: 'cup',
	tbsp: 'tbsp',
	'tbsp.': 'tbsp',
	tablespoon: 'tbsp',
	tablespoons: 'tbsp',
	tsp: 'tsp',
	'tsp.': 'tsp',
	teaspoon: 'tsp',
	teaspoons: 'tsp'
};

/** Real, internationally standardized conversion factors (US customary for volume — this app's
 *  own imported content is US-recipe-sourced) — exact, not approximations. */
const MASS_TO_GRAMS: Record<string, number> = {
	g: 1,
	kg: 1000,
	oz: 28.3495231,
	lb: 453.59237
};

const VOLUME_TO_ML: Record<string, number> = {
	ml: 1,
	l: 1000,
	cup: 236.588236,
	tbsp: 14.7867648,
	tsp: 4.92892159
};

/** Lowercases, trims, and resolves a known spelling variant to its canonical form — an unrecognized
 *  unit (e.g. "clove", "pinch", "large") passes through unchanged apart from that normalization,
 *  still treated as its own distinct `'other'`-family unit, not an error. */
export function normalizeUnit(raw: string): string {
	const cleaned = raw.trim().toLowerCase();
	return UNIT_ALIASES[cleaned] ?? cleaned;
}

export function familyOf(rawUnit: string): UnitFamily {
	const unit = normalizeUnit(rawUnit);
	if (unit in MASS_TO_GRAMS) return 'mass';
	if (unit in VOLUME_TO_ML) return 'volume';
	return 'other';
}

/**
 * Converts a quantity from one unit to another. Three real outcomes:
 * - Same canonical unit (after normalizing spelling): the quantity itself, unchanged.
 * - Same family (mass<->mass or volume<->volume): exact arithmetic via the base-unit tables above,
 *   `densityGPerMl` never consulted — there is no ambiguity to resolve.
 * - Different family (mass<->volume): only possible with a known `densityGPerMl` (from a cached
 *   `DensityClass`, see `ingredientDensity.svelte.ts`) — returns `null` without one, rather than
 *   guessing. `'other'`-family units on either side (a count/descriptor like "clove" or "pinch")
 *   always return `null` — there is no real conversion for those, not a gap to paper over.
 */
export function convertQuantity(
	quantity: number,
	fromUnit: string,
	toUnit: string,
	densityGPerMl?: number
): number | null {
	const from = normalizeUnit(fromUnit);
	const to = normalizeUnit(toUnit);
	if (from === to) return quantity;

	const fromFamily = familyOf(from);
	const toFamily = familyOf(to);
	if (fromFamily === 'other' || toFamily === 'other') return null;

	if (fromFamily === toFamily) {
		if (fromFamily === 'mass') {
			return (quantity * MASS_TO_GRAMS[from]) / MASS_TO_GRAMS[to];
		}
		return (quantity * VOLUME_TO_ML[from]) / VOLUME_TO_ML[to];
	}

	// Cross-family: needs a real density to bridge mass and volume.
	if (!densityGPerMl) return null;
	if (fromFamily === 'mass' && toFamily === 'volume') {
		const grams = quantity * MASS_TO_GRAMS[from];
		const ml = grams / densityGPerMl;
		return ml / VOLUME_TO_ML[to];
	}
	// fromFamily === 'volume' && toFamily === 'mass'
	const ml = quantity * VOLUME_TO_ML[from];
	const grams = ml * densityGPerMl;
	return grams / MASS_TO_GRAMS[to];
}

/** A quantity that only ever came from user input or exact addition always displayed cleanly
 *  before this module existed — real conversion math is the first thing in this app that produces
 *  a quantity like `263.411764...`, floating-point noise no shopping list should ever show. Rounds
 *  to 1 decimal place and drops a trailing ".0" — "263.4", not "263.411764" or "263.0". */
export function formatQuantity(quantity: number): string {
	const rounded = Math.round(quantity * 10) / 10;
	return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export type { UnitFamily, DensityClass };
