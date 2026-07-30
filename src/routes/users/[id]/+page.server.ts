import { error } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { getUserProfile } from '$lib/server/api/getUserProfile';
import { getMockUserProfile } from '$lib/api/mock/getUserProfile';
import { getRecipeApiClient } from '$lib/server/api/client';
import { AUTH_ACCOUNTS } from '$lib/api/mock/auth.mock';
import type { PageServerLoad, EntryGenerator } from './$types';

// Same "prerender crawl needs every id up front, at build time, against the mock fixtures"
// reasoning `recipes/[id]/+page.server.ts` already established — piotr/ania are the only real
// identities the Capacitor build's mock data ever attributes anything to.
export const entries: EntryGenerator = () => {
	return AUTH_ACCOUNTS.map((a) => ({ id: a.user.id }));
};

export const load: PageServerLoad = async ({ params, platform }) => {
	const user = platform?.env?.DB
		? await getUserProfile(getDb(platform), params.id)
		: getMockUserProfile(params.id);
	if (!user) error(404, 'User not found');

	// The one module FUTURES.md 9.1's Modular Profile ships on by default (Recipes) — filtered from
	// the same `list()` every other feed already calls, not a dedicated "recipes by author" query
	// this app's API has no real need for elsewhere.
	const allRecipes = await getRecipeApiClient(platform).list();
	const recipes = allRecipes.filter((r) => r.author.id === params.id);

	return { user, recipes };
};
