// GET  /api/comment-reports  -> { reports }  (scoped to what the caller may see)
// POST /api/comment-reports  -> { report }   (file one; auth required)
//
// The read scope is the part worth being explicit about: a moderator or admin gets the whole
// queue, a signed-in visitor gets only reports they filed plus reports against their own comments
// (which is exactly what /activity renders), and an anonymous visitor gets an empty list. That's
// enforced here, in the route, not by whichever page happens to be calling it.
import { json, error } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import {
	createReport,
	isReportReason,
	listAllReports,
	listReportsForUser,
	ModerationError
} from '$lib/server/api/moderation';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ platform, locals }) => {
	if (!platform?.env?.DB) return json({ reports: [] });
	if (!locals.user) return json({ reports: [] });
	const db = getDb(platform);
	const reports =
		locals.user.isModerator || locals.isAdmin
			? await listAllReports(db)
			: await listReportsForUser(db, locals.user.id);
	return json({ reports });
};

export const POST: RequestHandler = async ({ request, platform, locals }) => {
	if (!platform?.env?.DB) error(503, 'No backend available');
	// Reporting requires an account for the same reason commenting does (createComment.ts's own
	// note): a report with no identity behind it can't be weighed, rate-limited, or followed up on.
	if (!locals.user) error(401, 'You must be logged in to report a comment');

	const body = await request.json().catch(() => null);
	const commentId = body?.commentId;
	const reason = body?.reason;
	if (typeof commentId !== 'string' || !commentId) error(400, 'commentId is required');
	if (!isReportReason(reason)) error(400, 'reason must be spam, abuse, unsafe or other');

	try {
		const report = await createReport(getDb(platform), {
			commentId,
			reason,
			reportedById: locals.user.id
		});
		return json({ report }, { status: 201 });
	} catch (e) {
		if (e instanceof ModerationError) error(e.status, e.message);
		throw e;
	}
};
