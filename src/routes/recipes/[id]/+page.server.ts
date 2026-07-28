import { error } from '@sveltejs/kit';
import { mockApiClient, recipesById } from '$lib/api/mock';
import type { PageServerLoad, EntryGenerator } from './$types';

// Tells the Capacitor build's prerender crawler every `[id]` value to bake — derived from the same
// `recipesById` the mock client itself reads, so a new fixture recipe is automatically included
// without this file needing an update. Unused (and harmless) for the default Node build, which
// never prerenders this route at all — see routes/+layout.server.ts's own conditional.
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
