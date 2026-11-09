// PATCH  /api/admin/fuw/[id]  { status }  — accept / reject / back to pending
// DELETE /api/admin/fuw/[id]              — remove a submission and its photos (spam cleanup)
// 404 for non-admins, same as every other /api/admin route (see admin/+layout.server.ts).
import { error } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { FuwConflictError, deleteFuwSubmission, setFuwStatus } from '$lib/server/fuw';
import type { FuwStatus } from '$lib/types/fuw';
import type { RequestHandler } from './$types';

const STATUSES: FuwStatus[] = ['pending', 'accepted', 'rejected'];

export const PATCH: RequestHandler = async ({ params, platform, locals, request }) => {
	if (!platform?.env?.DB) error(503, 'No backend available');
	if (!locals.isAdmin || !locals.user) error(404, 'Not found');

	const body = (await request.json().catch(() => null)) as { status?: FuwStatus } | null;
	if (!body?.status || !STATUSES.includes(body.status)) error(400, 'status must be pending, accepted or rejected');
	if (!(await setFuwStatus(getDb(platform), params.id, body.status, locals.user.id))) error(404, 'Not found');
	return new Response(null, { status: 204 });
};

export const DELETE: RequestHandler = async ({ params, platform, locals }) => {
	if (!platform?.env?.DB) error(503, 'No backend available');
	if (!locals.isAdmin) error(404, 'Not found');
	try {
		if (!(await deleteFuwSubmission(getDb(platform), platform.env.MEDIA, params.id))) error(404, 'Not found');
	} catch (e) {
		if (e instanceof FuwConflictError) error(409, e.message);
		throw e;
	}
	return new Response(null, { status: 204 });
};
