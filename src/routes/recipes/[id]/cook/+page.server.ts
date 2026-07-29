import { error } from '@sveltejs/kit';
import { recipesById } from '$lib/api/mock';
import { getRecipeApiClient } from '$lib/server/api/client';
import type { PageServerLoad, EntryGenerator } from './$types';

// See routes/recipes/[id]/+page.server.ts's own comment — same reasoning, same derivation.
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
