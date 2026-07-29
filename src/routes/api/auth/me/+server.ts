// GET /api/auth/me -> { user: SessionUser | null }. Never an error status for "not logged in" —
// that's a real, ordinary response shape (most visitors), not a failure — matching this app's own
// established Progressive Profiling stance that anonymous is a legitimate first-class state, not
// something to represent as an error.
import { json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { validateSession, SESSION_COOKIE } from '$lib/server/auth/session';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ platform, cookies }) => {
	if (!platform) return json({ user: null });
	const user = await validateSession(getDb(platform), cookies.get(SESSION_COOKIE));
	return json({ user });
};
