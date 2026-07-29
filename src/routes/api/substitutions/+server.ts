import { json, error } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { createSubstitution, SubstitutionValidationError } from '$lib/server/api/createSubstitution';
import { validateSession, SESSION_COOKIE } from '$lib/server/auth/session';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, platform, cookies }) => {
	if (!platform) error(503, 'No backend available (Capacitor build has none by design)');
	const db = getDb(platform);
	const user = await validateSession(db, cookies.get(SESSION_COOKIE));
	if (!user) error(401, 'You must be logged in to propose a substitution');

	const input = await request.json();
	try {
		const id = await createSubstitution(db, user.id, input);
		return json({ id }, { status: 201 });
	} catch (e) {
		if (e instanceof SubstitutionValidationError) error(400, e.message);
		throw e;
	}
};
