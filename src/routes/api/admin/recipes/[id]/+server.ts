// DELETE /api/admin/recipes/<id> -> 204. Admin only, re-checked here (see the users route's own
// note on why inheriting /admin's page gate would not be enough).
//
// This is a hard delete and cascades to the recipe's ingredients, steps, comments, versions and
// translations. The dashboard confirms before calling it; nothing here is reversible afterwards,
// which is why comment *moderation* uses a soft tombstone instead and only this admin-level action
// really destroys rows.
import { error } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { deleteRecipe } from '$lib/server/api/admin';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async ({ params, platform, locals }) => {
	if (!platform?.env?.DB) error(503, 'No backend available');
	if (!locals.isAdmin) error(404, 'Not found');

	await deleteRecipe(getDb(platform), params.id);
	return new Response(null, { status: 204 });
};
