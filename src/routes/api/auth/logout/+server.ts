import { json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { invalidateSession, SESSION_COOKIE } from '$lib/server/auth/session';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ platform, cookies }) => {
	const token = cookies.get(SESSION_COOKIE);
	if (platform && token) {
		await invalidateSession(getDb(platform), token);
	}
	cookies.delete(SESSION_COOKIE, { path: '/' });
	return json({ success: true });
};
