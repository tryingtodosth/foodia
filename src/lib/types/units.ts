// Real Unit Conversion (CLAUDE.md 4.5/4.7's own "can't safely convert units" gap, closed for
// real). Two genuinely different problems, kept as two genuinely different types:
//
// 1. Same-family conversion (g <-> oz <-> lb, or ml <-> cup <-> tbsp <-> tsp) is exact arithmetic —
//    fixed, universal factors, true regardless of what's being measured. No ambiguity, ever.
// 2. Cross-family conversion (cup -> gram) needs to know how DENSE the specific ingredient is — a
//    cup of flour and a cup of sugar don't weigh the same. This app has no per-ingredient density
//    database, and fabricating one would silently produce wrong shopping-list quantities, worse
//    than not converting at all. `DensityClass` is the real, honest middle ground: instead of
//    "can't compare" as a dead end, or an invented exact density as a lie, ask the cook once which
//    of a few broad, genuinely representative density classes the ingredient belongs to, then
//    reuse that answer for every future conversion of the same ingredient.
export type UnitFamily = 'mass' | 'volume' | 'other';

export type DensityClass = 'powdery' | 'granular' | 'liquid' | 'light' | 'dense';

/** Approximate reference densities (grams per milliliter) for each class — real, representative
 *  reference points (flour/sugar/water/oats/honey are genuinely typical members of their own
 *  class), not lab-precise for any specific ingredient. Good enough for a shopping list; never
 *  presented as more precise than that. */
export const DENSITY_CLASS_G_PER_ML: Record<DensityClass, number> = {
	powdery: 0.53, // flour, cocoa powder, powdered sugar, cornstarch
	granular: 0.85, // granulated sugar, rice, breadcrumbs, salt
	liquid: 1.0, // water, milk, oil, juice
	light: 0.35, // rolled oats, shredded cheese, chopped nuts, leafy greens
	dense: 1.2 // honey, peanut butter, yogurt, syrup
};
