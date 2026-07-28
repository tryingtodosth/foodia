import { mockApiClient } from '$lib/api/mock';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	// Full RecipeDetail, not the thin Card list — the equipment-cookability check (Session 9,
	// lib/utils/cookability.ts) needs each recipe's own steps/alternatives, not just its flat
	// requiredEquipment. See lib/api/client.ts's own doc comment on `listDetails`.
	const recipes = await mockApiClient.listDetails();
	return { recipes };
};
