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

export type FacetMode = 'and' | 'or';

export interface RecipeFilters {
	tags: string[]; // included values — empty means "unrestricted", same convention 2do's own SearchFilters uses
	tagsExclude: string[]; // excluded values — a real toggle in the UI, never a `-tag` query-string operator
	tagsMode: FacetMode;
	dietFlags: string[];
	dietFlagsExclude: string[];
	dietFlagsMode: FacetMode;
	/**
	 * Search by ingredient — free-text TERMS, not values picked from a closed list. Tags and diet
	 * flags are short labels an author chose from what everyone else already used, so exact matching
	 * is right for those; an ingredient name is a full phrase somebody typed once ("Mięso mielone
	 * wołowo-wieprzowe"), and a cook searching for it types "mięso". Matching is therefore
	 * substring-based and accent-insensitive — see `ingredientMatches`. The AND default and the
	 * explicit per-facet OR toggle carry over unchanged: "chicken + rice" must mean recipes with
	 * BOTH by default, which is the entire lesson this file's own header records.
	 */
	ingredients: string[];
	ingredientsExclude: string[];
	ingredientsMode: FacetMode;
}

export function emptyRecipeFilters(): RecipeFilters {
	return {
		tags: [],
		tagsExclude: [],
		tagsMode: 'and',
		dietFlags: [],
		dietFlagsExclude: [],
		dietFlagsMode: 'and',
		ingredients: [],
		ingredientsExclude: [],
		ingredientsMode: 'and'
	};
}

export function hasActiveFilters(filters: RecipeFilters): boolean {
	return (
		filters.tags.length > 0 ||
		filters.tagsExclude.length > 0 ||
		filters.dietFlags.length > 0 ||
		filters.dietFlagsExclude.length > 0 ||
		filters.ingredients.length > 0 ||
		filters.ingredientsExclude.length > 0
	);
}

export function activeFilterCount(filters: RecipeFilters): number {
	return (
		filters.tags.length +
		filters.tagsExclude.length +
		filters.dietFlags.length +
		filters.dietFlagsExclude.length +
		filters.ingredients.length +
		filters.ingredientsExclude.length
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
 * Fold-insensitive comparison text: lowercased, with diacritics stripped. Polish is exactly why
 * this exists — a cook searching "maka" or "czosnek slodki" on a phone keyboard without a Polish
 * layout must still find "Mąka" and "Czosnek słodki". `NFD` splits an accented letter into its base
 * letter plus a combining mark, which the range below then removes; "ł" carries no combining mark
 * (it's a distinct letter, not an accented l), so it gets its own explicit entry rather than
 * silently failing the one case a Polish-first app can least afford to get wrong.
 */
function foldText(value: string): string {
	return value
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/ł/gi, 'l')
		.trim()
		.toLowerCase();
}

/** True when any of a recipe's ingredient names contains this search term. Substring, not equality
 *  — see `RecipeFilters.ingredients` for why an ingredient facet is a different kind of thing from
 *  a tag facet. */
export function ingredientMatches(ingredients: Pick<Ingredient, 'name'>[], term: string): boolean {
	const needle = foldText(term);
	if (!needle) return true;
	return ingredients.some((i) => foldText(i.name).includes(needle));
}

function matchesIngredientFacet(
	ingredients: Pick<Ingredient, 'name'>[],
	terms: string[],
	mode: FacetMode
): boolean {
	if (terms.length === 0) return true;
	return mode === 'and'
		? terms.every((term) => ingredientMatches(ingredients, term))
		: terms.some((term) => ingredientMatches(ingredients, term));
}

/**
 * Facet *groups* (tags vs. dietFlags vs. ingredients) always combine via AND — a recipe must
 * satisfy every facet. Values *within* one group combine per that group's own mode. Same two-level
 * structure 2do's own SearchFiltersSidebar already establishes for its tag/skill facets.
 *
 * `ingredients` is optional on the input type on purpose: this function has always taken the thin
 * Card shape, which genuinely has no ingredient list (lib/types/recipe.ts's own Card/Detail weight
 * split). A caller passing Cards can still filter by tag and diet flag exactly as before; only an
 * ingredient search needs Details, which is what every page that offers one already loads
 * (`listDetails`, see routes/+page.server.ts). A Card given an ingredient term matches nothing
 * rather than everything — silently ignoring a filter the cook can see is selected would be worse.
 */
export function passesFilters(
	recipe: Pick<RecipeCard, 'tags' | 'dietFlags'> & { ingredients?: Pick<Ingredient, 'name'>[] },
	filters: RecipeFilters
): boolean {
	const ingredients = recipe.ingredients ?? [];
	return (
		matchesFacet(recipe.tags, filters.tags, filters.tagsMode) &&
		matchesExclusion(recipe.tags, filters.tagsExclude) &&
		matchesFacet(recipe.dietFlags, filters.dietFlags, filters.dietFlagsMode) &&
		matchesExclusion(recipe.dietFlags, filters.dietFlagsExclude) &&
		matchesIngredientFacet(ingredients, filters.ingredients, filters.ingredientsMode) &&
		!filters.ingredientsExclude.some((term) => ingredientMatches(ingredients, term))
	);
}

export function filterRecipes<
	T extends Pick<RecipeCard, 'tags' | 'dietFlags'> & { ingredients?: Pick<Ingredient, 'name'>[] }
>(recipes: T[], filters: RecipeFilters): T[] {
	return recipes.filter((r) => passesFilters(r, filters));
}

/**
 * Every ingredient name in the corpus, deduplicated case-insensitively and sorted — the suggestion
 * list behind the ingredient search box. Derived from real content, never a fixed vocabulary, the
 * same call `distinctValues` already makes below for tags and diet flags and for the same reason.
 * The first spelling encountered wins as the display form; a corpus holding both "Czosnek" and
 * "czosnek" offers one suggestion, not two that filter identically.
 */
export function distinctIngredientNames(
	recipes: { ingredients?: Pick<Ingredient, 'name'>[] }[]
): string[] {
	const byFolded = new Map<string, string>();
	for (const recipe of recipes) {
		for (const ingredient of recipe.ingredients ?? []) {
			const name = ingredient.name.trim();
			if (!name) continue;
			const key = foldText(name);
			if (!byFolded.has(key)) byFolded.set(key, name);
		}
	}
	return [...byFolded.values()].sort((a, b) => a.localeCompare(b, 'pl'));
}

/** Suggestions for what's been typed so far — accent-insensitive substring, capped so a long
 *  corpus can't push the rest of the page off screen. An empty query returns nothing rather than
 *  everything: a dropdown that opens the moment the box is focused, listing every ingredient in the
 *  app, is noise, not help. */
export function suggestIngredientNames(
	allNames: string[],
	query: string,
	alreadyChosen: string[] = [],
	limit = 8
): string[] {
	const needle = foldText(query);
	if (!needle) return [];
	const chosen = new Set(alreadyChosen.map(foldText));
	return allNames
		.filter((name) => foldText(name).includes(needle) && !chosen.has(foldText(name)))
		.slice(0, limit);
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
