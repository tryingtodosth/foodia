// GET /api/recipes/[id] -> RecipeDetail (getDetail()). No separate ?card=true variant — getCard()
// is a pure derivation of getDetail() (dbApiClient's own toCard, same as mockApiClient's), so
// httpApiClient does that stripping client-side rather than needing a second endpoint for it.
import { json, error } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { createDbApiClient } from '$lib/server/api/dbApiClient';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, platform }) => {
	const client = createDbApiClient(getDb(platform));
	try {
		return json(await client.getDetail(params.id));
	} catch {
		error(404, `Recipe not found: ${params.id}`);
	}
};
