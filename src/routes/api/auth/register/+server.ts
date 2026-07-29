import { json, error } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { register } from '$lib/server/auth';
import { SESSION_COOKIE } from '$lib/server/auth/session';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, platform, cookies }) => {
	if (!platform) error(503, 'No backend available (Capacitor build has none by design)');
	const { email, password, displayName } = await request.json();
	if (!email || !password || !displayName) error(400, 'email, password, and displayName are all required');

	const result = await register(getDb(platform), email, password, displayName);
	if (!result.success || !result.sessionToken) {
		return json({ success: false, error: result.error }, { status: 409 });
	}

	cookies.set(SESSION_COOKIE, result.sessionToken, {
		path: '/',
		httpOnly: true,
		secure: true,
		sameSite: 'lax',
		maxAge: 60 * 60 * 24 * 30
	});
	return json({ success: true, user: result.user }, { status: 201 });
};
