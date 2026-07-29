// The real recipe read/write endpoint (CLAUDE.md Section 5, Session 16/18) — what `httpApiClient`
// fetches from. Three read shapes off one GET, matching `RecipeApiClient`'s own three list-ish
// methods rather than inventing three separate URLs for what's really one query with a different
// projection:
//   GET /api/recipes             -> RecipeCard[]    (list())
//   GET /api/recipes?detail=full -> RecipeDetail[]   (listDetails())
//   GET /api/recipes?ids=r1,r2   -> RecipeDetail[]   (getManyDetails())
//   POST /api/recipes            -> { id }           (the Recipe-First Composer's own write path,
//                                                       CLAUDE.md 4.2/FUTURES.md 9.4 — Session 18)
import { json, error } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { createDbApiClient } from '$lib/server/api/dbApiClient';
import { createRecipe, RecipeValidationError } from '$lib/server/api/createRecipe';
import { validateSession, SESSION_COOKIE } from '$lib/server/auth/session';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, platform }) => {
	const client = createDbApiClient(getDb(platform));
	const idsParam = url.searchParams.get('ids');

	if (idsParam) {
		const ids = idsParam.split(',').map((s) => s.trim()).filter(Boolean);
		return json(await client.getManyDetails(ids));
	}
	if (url.searchParams.get('detail') === 'full') {
		return json(await client.listDetails());
	}
	return json(await client.list());
};

// Deliberately requires a real, logged-in author — Progressive Profiling (4.1) never gates
// *reading* Foodia on an account, but *publishing* a recipe under someone's name genuinely needs
// to know whose name that is; there's no anonymous-authorship concept anywhere else in this app
// either (every NodeComment/Substitution already requires a UserRef author).
export const POST: RequestHandler = async ({ request, platform, cookies }) => {
	if (!platform) error(503, 'No backend available (Capacitor build has none by design)');
	const db = getDb(platform);
	const user = await validateSession(db, cookies.get(SESSION_COOKIE));
	if (!user) error(401, 'You must be logged in to publish a recipe');

	const input = await request.json();
	try {
		const id = await createRecipe(db, user.id, input);
		return json({ id }, { status: 201 });
	} catch (e) {
		if (e instanceof RecipeValidationError) error(400, e.message);
		throw e;
	}
};
