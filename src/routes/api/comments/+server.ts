import { json, error } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { createComment, CommentValidationError } from '$lib/server/api/createComment';
import { validateSession, SESSION_COOKIE } from '$lib/server/auth/session';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, platform, cookies }) => {
	if (!platform) error(503, 'No backend available (Capacitor build has none by design)');
	const db = getDb(platform);
	const user = await validateSession(db, cookies.get(SESSION_COOKIE));
	if (!user) error(401, 'You must be logged in to comment');

	const input = await request.json();
	try {
		const id = await createComment(db, user.id, input);
		return json({ id }, { status: 201 });
	} catch (e) {
		if (e instanceof CommentValidationError) error(400, e.message);
		throw e;
	}
};
