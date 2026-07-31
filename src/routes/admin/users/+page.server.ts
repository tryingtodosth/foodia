import { getDb } from '$lib/server/db';
import { loadUsers } from '$lib/server/api/admin';
import { adminEmails } from '$lib/server/auth/admin';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
	if (!platform?.env?.DB) return { users: [], adminEmails: [] };
	return {
		users: await loadUsers(getDb(platform)),
		// Sent so the table can mark which rows are allowlisted admins (and disable their delete
		// button). Not a secret — the list is the *authorization* side, and only an admin ever
		// receives this response in the first place.
		adminEmails: adminEmails(platform)
	};
};
