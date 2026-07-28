import { error } from '@sveltejs/kit';
import { mockApiClient, recipesById } from '$lib/api/mock';
import type { PageServerLoad, EntryGenerator } from './$types';

// See routes/recipes/[id]/+page.server.ts's own comment — same reasoning, same derivation.
export const entries: EntryGenerator = () => {
	return Object.keys(recipesById).map((id) => ({ id }));
};

export const load: PageServerLoad = async ({ params }) => {
	try {
		const recipe = await mockApiClient.getDetail(params.id);
		return { recipe };
	} catch {
		error(404, 'Recipe not found');
	}
};
