import { mockApiClient } from '$lib/api/mock';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	// Full RecipeDetail, not the thin Card list — the substitution-recognition queue below needs
	// each recipe's own ingredients/substitutions, which a bare RecipeCard doesn't carry. Same
	// reasoning routes/+page.server.ts/plan/+page.server.ts already give for their own listDetails()
	// use. Scoped to the FIXTURE corpus only, deliberately — a substitution proposed live during the
	// current tab session (sessionSubstitutions, page-local on /recipes/[id]) never accumulates real
	// reactions anyway (ReactionButtons' own vote override is a component-local display only, never
	// aggregated anywhere shared — see substitutionModeration.svelte.ts's own header comment), so
	// there is nothing for a live-proposed substitution to become eligible FROM in this mock-era
	// build. Flagged as a real, stated scope boundary, not silently glossed over.
	const recipes = await mockApiClient.listDetails();
	return { recipes };
};
