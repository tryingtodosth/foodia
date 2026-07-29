import { getRecipeApiClient } from '$lib/server/api/client';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
	// Full RecipeDetail, not the thin Card list — see routes/+page.server.ts's own identical note.
	const recipes = await getRecipeApiClient(platform).listDetails();
	return { recipes };
};
