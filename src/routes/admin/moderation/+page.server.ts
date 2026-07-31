import { getDb } from '$lib/server/db';
import { listAllReports, listRecognizedSubstitutionIds } from '$lib/server/api/moderation';
import { getRecipeApiClient } from '$lib/server/api/client';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
	if (!platform?.env?.DB) return { reports: [], recognizedIds: [], recipes: [] };
	const db = getDb(platform);
	// Reports come straight from D1 rather than from `commentModerationStore` the way /moderation
	// does — this page is server-rendered with real rows, so an admin opening it on a fresh device
	// sees the true queue immediately rather than waiting for a client-side hydrate.
	const [reports, recognizedIds, recipes] = await Promise.all([
		listAllReports(db),
		listRecognizedSubstitutionIds(db),
		// Needed for the substitution-recognition queue, which has to know each substitution's own
		// recipe/ingredient context and reaction counts — the same full-detail list /moderation's
		// own load already fetches for this exact purpose.
		getRecipeApiClient(platform).listDetails()
	]);
	return { reports, recognizedIds, recipes };
};
