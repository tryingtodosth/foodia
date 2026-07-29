import { getRecipeApiClient } from '$lib/server/api/client';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
	// Full RecipeDetail, not the thin Card list — the equipment-cookability check (Session 9,
	// lib/utils/cookability.ts) needs each recipe's own steps/alternatives, not just its flat
	// requiredEquipment. See lib/api/client.ts's own doc comment on `listDetails`.
	const recipes = await getRecipeApiClient(platform).listDetails();
	return { recipes };
};
