import { error } from '@sveltejs/kit';
import { recipesById } from '$lib/api/mock';
import { getRecipeApiClient } from '$lib/server/api/client';
import type { PageServerLoad, EntryGenerator } from './$types';

// Tells the Capacitor build's prerender crawler every `[id]` value to bake. Deliberately still
// reads the mock `recipesById`, not D1 — this runs at BUILD time, with no live platform/D1 binding
// to query even for the default target, and the Capacitor target can never have one at all (see
// lib/server/api/client.ts's own header comment). A real backend-driven entries list is a genuine
// future need once recipes can be created (CLAUDE.md 4.2) rather than only living in the fixture
// corpus, not something this session's scope covers.
export const entries: EntryGenerator = () => {
	return Object.keys(recipesById).map((id) => ({ id }));
};

export const load: PageServerLoad = async ({ params, platform }) => {
	try {
		const recipe = await getRecipeApiClient(platform).getDetail(params.id);
		return { recipe };
	} catch {
		error(404, 'Recipe not found');
	}
};
