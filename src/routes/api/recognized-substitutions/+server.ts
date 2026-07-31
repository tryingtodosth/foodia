// GET  /api/recognized-substitutions            -> { ids }  (public — it's a visible badge)
// POST /api/recognized-substitutions { id }     -> 204       (moderator/admin only)
//
// The read is deliberately unauthenticated: "⭐ recognized by the community" is a label every
// viewer sees on the recipe page, so hiding the list from anonymous visitors would only break the
// badge for most of the people it exists to inform.
import { json, error } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import {
	listRecognizedSubstitutionIds,
	markRecognized,
	ModerationError
} from '$lib/server/api/moderation';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ platform }) => {
	if (!platform?.env?.DB) return json({ ids: [] });
	return json({ ids: await listRecognizedSubstitutionIds(getDb(platform)) });
};

export const POST: RequestHandler = async ({ request, platform, locals }) => {
	if (!platform?.env?.DB) error(503, 'No backend available');
	if (!locals.user) error(401, 'You must be logged in');
	if (!locals.user.isModerator && !locals.isAdmin) error(403, 'Moderator permission required');

	const body = await request.json().catch(() => null);
	const id = body?.substitutionId;
	if (typeof id !== 'string' || !id) error(400, 'substitutionId is required');

	try {
		await markRecognized(getDb(platform), id);
		return new Response(null, { status: 204 });
	} catch (e) {
		if (e instanceof ModerationError) error(e.status, e.message);
		throw e;
	}
};
