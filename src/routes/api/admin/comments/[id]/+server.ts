// PATCH  /api/admin/comments/<id> { removed: boolean } -> 204   (tombstone / restore)
// DELETE /api/admin/comments/<id>                      -> 204   (hard delete)
//
// Two genuinely different actions, kept separate rather than merged behind one "delete" button:
// hiding a comment leaves the row (reversible, and the thread still reads sensibly around a
// tombstone), while deleting it destroys the evidence a report was filed about. The dashboard
// offers both and says which is which.
import { error } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { deleteComment, setCommentRemoved } from '$lib/server/api/admin';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ params, request, platform, locals }) => {
	if (!platform?.env?.DB) error(503, 'No backend available');
	if (!locals.isAdmin || !locals.user) error(404, 'Not found');

	const body = await request.json().catch(() => null);
	if (typeof body?.removed !== 'boolean') error(400, 'removed must be a boolean');

	await setCommentRemoved(getDb(platform), params.id, body.removed, locals.user.id);
	return new Response(null, { status: 204 });
};

export const DELETE: RequestHandler = async ({ params, platform, locals }) => {
	if (!platform?.env?.DB) error(503, 'No backend available');
	if (!locals.isAdmin) error(404, 'Not found');

	await deleteComment(getDb(platform), params.id);
	return new Response(null, { status: 204 });
};
