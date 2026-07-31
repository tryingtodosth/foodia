import { getDb } from '$lib/server/db';
import { loadStats, loadUsers, loadRecipes } from '$lib/server/api/admin';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
	// The parent layout load already 404'd for anyone who isn't an admin, so reaching this line at
	// all means the request is allowed. `platform` can still be missing in the static build's SPA
	// fallback, which is the only reason for the guard.
	if (!platform?.env?.DB) {
		return { stats: null, recentUsers: [], recentRecipes: [] };
	}
	const db = getDb(platform);
	const [stats, users, recipes] = await Promise.all([loadStats(db), loadUsers(db), loadRecipes(db)]);
	return {
		stats,
		// The overview only wants a glance at each — the full tables live on their own tabs.
		recentUsers: users.slice(0, 8),
		recentRecipes: recipes.slice(0, 8)
	};
};
