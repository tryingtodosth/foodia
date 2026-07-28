// Session-only, cross-route store for community-proposed StepAlternatives (CLAUDE.md 4.9,
// Section 7 item 27). Keyed by recipe id and kept alive for the whole browser tab/session — NOT
// reset per-page-mount the way the old local `$state` on /recipes/[id]/+page.svelte was — so a
// technique proposed while browsing a recipe's detail page is still visible, and auto-suggestable,
// the moment the same cook navigates into that same recipe's /recipes/[id]/cook, without a hard
// reload losing it. This app's 6th `.svelte.ts` rune store, same "object of getters + methods
// wrapping module-level $state" idiom profile/pantry/mealPlan/uiLocale/auth already establish.
//
// Deliberately NOT persisted to localStorage/a cookie — same "session-only, resets on a hard
// reload" honesty every other community write-side feature in this app already carries
// (sessionComments, sessionSubstitutions, sessionTranslations, all still page-local). This store
// only widens the *scope* of "session" from "one page's lifetime" to "one browser tab's lifetime,"
// it doesn't change the underlying "nothing here survives a reload" promise.
import type { StepAlternative } from '$lib/types/recipe';

let byRecipeId = $state<Record<string, StepAlternative[]>>({});

export const sessionStepAlternativesStore = {
	forRecipe(recipeId: string): StepAlternative[] {
		return byRecipeId[recipeId] ?? [];
	},
	propose(recipeId: string, alternative: StepAlternative): void {
		byRecipeId = {
			...byRecipeId,
			[recipeId]: [...(byRecipeId[recipeId] ?? []), alternative]
		};
	}
};
