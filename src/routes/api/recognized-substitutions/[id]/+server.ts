// DELETE /api/recognized-substitutions/<id> -> 204. Undoing a promotion (the "Cofnij" action
// /moderation already offered against its own session-only store), moderator/admin only.
import { error } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { unmarkRecognized } from '$lib/server/api/moderation';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async ({ params, platform, locals }) => {
	if (!platform?.env?.DB) error(503, 'No backend available');
	if (!locals.user) error(401, 'You must be logged in');
	if (!locals.user.isModerator && !locals.isAdmin) error(403, 'Moderator permission required');

	await unmarkRecognized(getDb(platform), params.id);
	return new Response(null, { status: 204 });
};
