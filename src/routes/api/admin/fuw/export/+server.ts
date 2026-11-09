// GET /api/admin/fuw/export?format=csv|json&status=accepted|pending|rejected|all
// The book's raw material: accepted submissions by default, downloaded as a file. Admin only —
// the export includes contributors' contact emails.
import { json, error } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { fuwSubmissionsToCsv, listFuwSubmissions } from '$lib/server/fuw';
import type { FuwStatus } from '$lib/types/fuw';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, platform, locals }) => {
	if (!platform?.env?.DB) error(503, 'No backend available');
	if (!locals.isAdmin) error(404, 'Not found');

	const statusParam = url.searchParams.get('status') ?? 'accepted';
	const status = statusParam === 'all' ? undefined : (statusParam as FuwStatus);
	if (status && !['pending', 'accepted', 'rejected'].includes(status)) error(400, 'Unknown status');
	const subs = await listFuwSubmissions(getDb(platform), status);

	const stamp = new Date().toISOString().slice(0, 10);
	const name = `ksiazka-kucharska-fuw-${statusParam}-${stamp}`;
	if (url.searchParams.get('format') === 'csv') {
		return new Response(fuwSubmissionsToCsv(subs, url.origin), {
			headers: {
				'content-type': 'text/csv; charset=utf-8',
				'content-disposition': `attachment; filename="${name}.csv"`
			}
		});
	}
	return json(subs, { headers: { 'content-disposition': `attachment; filename="${name}.json"` } });
};
