// PATCH /api/comment-reports/<id> { action: 'remove' | 'dismiss' } -> { report }
//
// Moderator or admin only. Note which two things count and which doesn't: `users.is_moderator`
// (the role this app has always had) and the ADMIN_EMAILS allowlist — but never "the client said
// it was allowed." /moderation's own gate is client-side by design and always has been; this is
// the check that actually decides.
import { json, error } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { resolveReport, ModerationError } from '$lib/server/api/moderation';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ params, request, platform, locals }) => {
	if (!platform?.env?.DB) error(503, 'No backend available');
	if (!locals.user) error(401, 'You must be logged in');
	if (!locals.user.isModerator && !locals.isAdmin) error(403, 'Moderator permission required');

	const body = await request.json().catch(() => null);
	const action = body?.action;
	if (action !== 'remove' && action !== 'dismiss') error(400, "action must be 'remove' or 'dismiss'");

	try {
		const report = await resolveReport(getDb(platform), params.id, action, locals.user.id);
		return json({ report });
	} catch (e) {
		if (e instanceof ModerationError) error(e.status, e.message);
		throw e;
	}
};
