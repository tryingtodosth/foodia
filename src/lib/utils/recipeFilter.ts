// Search, Filtering & Categorization (CLAUDE.md Section 4.7) — pure, framework-agnostic functions
// (no Svelte import), same discipline substitution.ts/hardware.ts/week.ts already follow. The
// data (RecipeCard.tags/dietFlags) already exists and is already rendered on RecipeCard.svelte —
// this is the missing filtering half, not a new data model.
//
// The one explicit lesson this spec is built around (the source Reddit research, FUTURES.md):
// Paprika's own named failure mode is multi-tag filtering that silently applies OR where the user
// expects AND — picking "Vietnamese cuisine" + "salads" floods the result with every Vietnamese
// dish (heavy soups included) *plus* every salad, the union, instead of the intersection (only
// Vietnamese salads). AND (every selected value must be present) is the default here for every
// facet's own included values; OR is only ever reached via an explicit, visible per-facet toggle
// — get this right from day one rather than tuning it later.
import type { Ingredient, RecipeCard } from '$lib/types/recipe';
import { defaultAllergenNameMatch } from '$lib/utils/substitution';

export type FacetMode = 'and' | 'or';

export interface RecipeFilters {
	tags: string[]; // included values — empty means "unrestricted", same convention 2do's own SearchFilters uses
	tagsExclude: string[]; // excluded values — a real toggle in the UI, never a `-tag` query-string operator
	tagsMode: FacetMode;
	dietFlags: string[];
	dietFlagsExclude: string[];
	dietFlagsMode: FacetMode;
}

export function emptyRecipeFilters(): RecipeFilters {
	return {
		tags: [],
		tagsExclude: [],
		tagsMode: 'and',
		dietFlags: [],
		dietFlagsExclude: [],
		dietFlagsMode: 'and'
	};
}

export function hasActiveFilters(filters: RecipeFilters): boolean {
	return (
		filters.tags.length > 0 ||
		filters.tagsExclude.length > 0 ||
		filters.dietFlags.length > 0 ||
		filters.dietFlagsExclude.length > 0
	);
}

export function activeFilterCount(filters: RecipeFilters): number {
	return (
		filters.tags.length + filters.tagsExclude.length + filters.dietFlags.length + filters.dietFlagsExclude.length
	);
}

function matchesFacet(itemValues: string[], included: string[], mode: FacetMode): boolean {
	if (included.length === 0) return true;
	const lower = new Set(itemValues.map((v) => v.toLowerCase()));
	return mode === 'and'
		? included.every((v) => lower.has(v.toLowerCase()))
		: included.some((v) => lower.has(v.toLowerCase()));
}

/** Exclusion is always "if ANY excluded value is present, reject" — there's no meaningful
 *  AND/OR distinction for exclusion the way there is for inclusion (Paprika's own bug was about
 *  inclusion specifically), so this deliberately takes no mode parameter. */
function matchesExclusion(itemValues: string[], excluded: string[]): boolean {
	if (excluded.length === 0) return true;
	const lower = new Set(itemValues.map((v) => v.toLowerCase()));
	return !excluded.some((v) => lower.has(v.toLowerCase()));
}

/**
 * Facet *groups* (tags vs. dietFlags) always combine via AND — a recipe must satisfy the tag
 * facet AND the diet-flag facet. Values *within* one group combine per that group's own mode.
 * Same two-level structure 2do's own SearchFiltersSidebar already establishes for its tag/skill
 * facets, just scoped to the two facets this app actually has.
 */
export function passesFilters(
	recipe: Pick<RecipeCard, 'tags' | 'dietFlags'>,
	filters: RecipeFilters
): boolean {
	return (
		matchesFacet(recipe.tags, filters.tags, filters.tagsMode) &&
		matchesExclusion(recipe.tags, filters.tagsExclude) &&
		matchesFacet(recipe.dietFlags, filters.dietFlags, filters.dietFlagsMode) &&
		matchesExclusion(recipe.dietFlags, filters.dietFlagsExclude)
	);
}

export function filterRecipes<T extends Pick<RecipeCard, 'tags' | 'dietFlags'>>(
	recipes: T[],
	filters: RecipeFilters
): T[] {
	return recipes.filter((r) => passesFilters(r, filters));
}

/**
 * Facet option lists are derived from the real corpus, not a fixed vocabulary — `tags`/
 * `dietFlags` are free text (Section 3's own note: "no fixed vocabulary yet"), the same
 * "no fixed list, derive from what's actually there" call personali's own
 * `distinctCollaborationModes` already makes for an analogous free-text field.
 */
export function distinctValues(
	recipes: Pick<RecipeCard, 'tags' | 'dietFlags'>[],
	field: 'tags' | 'dietFlags'
): string[] {
	const set = new Set<string>();
	for (const r of recipes) {
		for (const v of r[field]) set.add(v);
	}
	return [...set].sort((a, b) => a.localeCompare(b, 'pl'));
}

/**
 * The allergy guardrail at RECIPE level (CLAUDE.md 4.1 — "a hard constraint, enforced in code,
 * never an AI suggestion"). `filterSafeSubstitutions` has always applied this same rule to the
 * swaps offered *inside* a recipe; this applies it one level up, to whether the recipe should be
 * offered at all.
 *
 * Deliberately NOT part of `RecipeFilters` above, and deliberately not routed through
 * `passesFilters`. Everything in that struct is a cook's browsing *preference* — freely toggled,
 * empty by default, and correct to ignore when nothing is selected. An allergy is a safety
 * constraint that happens to be shaped like a filter, and the two must not share a code path where
 * a future "clear all filters" button could reach it. Same separation `routes/+page.svelte` already
 * keeps between the hardware hard-filter and the facet panel.
 *
 * Matching is delegated to `defaultAllergenNameMatch` — the one, shared, Polish-declension-aware
 * stem comparison, not a second copy (see that function's own header for why the stem approach
 * exists and what it deliberately trades away). It errs toward over-filtering, which at recipe
 * level means hiding a possibly-safe recipe rather than offering a possibly-unsafe one — the
 * correct direction for a guardrail, and the same direction it already errs in for substitutions.
 *
 * `ingredients` is optional for the same Card/Detail reason `passesFilters` documents, but the
 * honest consequence is the opposite one and worth stating plainly: a recipe whose ingredients
 * simply weren't loaded is reported SAFE, because "no ingredient names to check" is genuinely not
 * evidence of an allergen. That makes this function only as strong as its caller's data — every
 * current caller (`/plan`, which loads `listDetails()`) passes real `RecipeDetail`s. A future
 * Card-only listing page must load details before claiming to filter by allergy here, rather than
 * calling this and getting a silent pass for everything.
 */
export function isRecipeAllergySafe(
	recipe: { ingredients?: Pick<Ingredient, 'name'>[] },
	allergies: string[],
	allergenNameMatch: (name: string, allergy: string) => boolean = defaultAllergenNameMatch
): boolean {
	if (allergies.length === 0) return true;
	const ingredients = recipe.ingredients ?? [];
	return !ingredients.some((ingredient) =>
		allergies.some((allergy) => {
			const trimmed = allergy.trim();
			// A blank entry would otherwise reduce to an empty stem that every name "starts with",
			// hiding the entire corpus. Real input for this exists: the onboarding chip list is built
			// from free text, and a stray comma or a lone space is a plausible thing to end up in it.
			return trimmed.length > 0 && allergenNameMatch(ingredient.name, trimmed);
		})
	);
}

/** The list form of `isRecipeAllergySafe` — mirrors `filterRecipes`/`filterSafeSubstitutions`'s own
 *  shape so a caller filtering by allergy reads the same as one filtering by anything else. */
export function filterAllergySafeRecipes<T extends { ingredients?: Pick<Ingredient, 'name'>[] }>(
	recipes: T[],
	allergies: string[]
): T[] {
	if (allergies.length === 0) return recipes;
	return recipes.filter((r) => isRecipeAllergySafe(r, allergies));
}

export type FacetValueState = 'neutral' | 'include' | 'exclude';

export function facetValueState(value: string, included: string[], excluded: string[]): FacetValueState {
	if (included.includes(value)) return 'include';
	if (excluded.includes(value)) return 'exclude';
	return 'neutral';
}

/**
 * One control cycles a facet value through neutral → include → exclude → neutral, rather than
 * two separate multi-select lists for "select" vs. "avoid" — functionally the same real,
 * click-driven exclusion control the spec calls for (not a `-tag` query-mini-language), just one
 * button per value instead of two. `included`/`excluded` are always kept mutually exclusive by
 * construction — a value can never be in both at once.
 */
export function cycleFacetValue(
	value: string,
	included: string[],
	excluded: string[]
): { included: string[]; excluded: string[] } {
	const state = facetValueState(value, included, excluded);
	if (state === 'neutral') {
		return { included: [...included, value], excluded };
	}
	if (state === 'include') {
		return { included: included.filter((v) => v !== value), excluded: [...excluded, value] };
	}
	return { included, excluded: excluded.filter((v) => v !== value) };
}
