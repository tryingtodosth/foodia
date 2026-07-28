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
import type { RecipeCard } from '$lib/types/recipe';

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
