import { mockApiClient } from '$lib/api/mock';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	// Full RecipeDetail, not the thin Card list — see routes/+page.server.ts's own identical note.
	const recipes = await mockApiClient.listDetails();
	return { recipes };
};
