// PATCH  /api/admin/users/<id> { flag: 'isModerator' | 'canUpload', value: boolean } -> 204
// DELETE /api/admin/users/<id>                                                        -> 204
//
// Admin only, re-checked here rather than inherited from /admin's own page gate — a fetch to this
// URL never passes through that layout load, so relying on it would leave these endpoints open.
import { error, json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { deleteUser, setUserFlag } from '$lib/server/api/admin';
import { adminEmails } from '$lib/server/auth/admin';
import * as schema from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ params, request, platform, locals }) => {
	if (!platform?.env?.DB) error(503, 'No backend available');
	if (!locals.isAdmin) error(404, 'Not found');

	const body = await request.json().catch(() => null);
	const flag = body?.flag;
	const value = body?.value;
	if (flag !== 'isModerator' && flag !== 'canUpload') error(400, 'flag must be isModerator or canUpload');
	if (typeof value !== 'boolean') error(400, 'value must be a boolean');

	await setUserFlag(getDb(platform), params.id, flag, value);
	return new Response(null, { status: 204 });
};

export const DELETE: RequestHandler = async ({ params, platform, locals }) => {
	if (!platform?.env?.DB) error(503, 'No backend available');
	if (!locals.isAdmin) error(404, 'Not found');
	if (params.id === locals.user?.id) error(400, 'You cannot delete your own admin account');

	// Belt and braces: deleting any account that's on the allowlist would lock that admin out of
	// the dashboard with no in-app way back (the allowlist grants access to a *login*, and there'd
	// no longer be one). Blocked here rather than left to a careful click.
	const db = getDb(platform);
	const [target] = await db
		.select({ email: schema.users.email })
		.from(schema.users)
		.where(eq(schema.users.id, params.id));
	if (target && adminEmails(platform).includes(target.email.toLowerCase())) {
		error(400, 'That account is on the admin allowlist');
	}

	await deleteUser(db, params.id);
	return json({ deleted: params.id });
};
