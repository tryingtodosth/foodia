// Session 24 — "when English is active, show only English recipes." A recipe's own `sourceLocale`
// (absent means `'pl'` — RecipeCard's own doc comment, true of every recipe created before this
// session) is a different vocabulary from the interface's own `UiLocale` (lib/i18n/locales.ts) —
// a recipe can be authored in, or translated into, a language the interface shell doesn't support
// yet. Filtering by simple equality here is the same "no cross-vocabulary cleverness" restraint
// this app's own translation section already documents for that split — a recipe with an English
// *translation* of its name/summary but Polish ingredients/steps still isn't "an English recipe"
// in the sense this filter means (CLAUDE.md's translation scope never covers ingredients/steps),
// so translations deliberately don't widen this match.
import type { RecipeCard } from '$lib/types/recipe';
import type { UiLocale } from '$lib/i18n/locales';

export function matchesUiLocale<T extends Pick<RecipeCard, 'sourceLocale'>>(
	recipe: T,
	locale: UiLocale
): boolean {
	return (recipe.sourceLocale ?? 'pl') === locale;
}

export function filterByUiLocale<T extends Pick<RecipeCard, 'sourceLocale'>>(
	recipes: T[],
	locale: UiLocale
): T[] {
	return recipes.filter((r) => matchesUiLocale(r, locale));
}
