// POST /api/admin/fuw/[id]/promote — turn a submission into a public Foodia recipe. Admin only.
import { json, error } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { FuwConflictError, FuwValidationError, promoteFuwSubmission } from '$lib/server/fuw';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, platform, locals }) => {
	if (!platform?.env?.DB) error(503, 'No backend available');
	if (!locals.isAdmin || !locals.user) error(404, 'Not found');
	try {
		const recipeId = await promoteFuwSubmission(getDb(platform), params.id, locals.user.id);
		return json({ recipeId }, { status: 201 });
	} catch (e) {
		if (e instanceof FuwConflictError) error(409, e.message);
		if (e instanceof FuwValidationError) error(400, e.message);
		throw e;
	}
};
