// /admin/fuw — review queue for the Physics Faculty cookbook form (docs/fuw.md). The admin gate is
// the parent +layout.server.ts, which 404s before this load ever runs for anyone else.
import { getDb } from '$lib/server/db';
import { listFuwSubmissions } from '$lib/server/fuw';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
	if (!platform?.env?.DB) return { submissions: [] };
	return { submissions: await listFuwSubmissions(getDb(platform)) };
};
