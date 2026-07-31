import { getDb } from '$lib/server/db';
import { loadRecipes, loadRecentComments } from '$lib/server/api/admin';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
	if (!platform?.env?.DB) return { recipes: [], comments: [] };
	const db = getDb(platform);
	const [recipes, comments] = await Promise.all([loadRecipes(db), loadRecentComments(db)]);
	return { recipes, comments };
};
