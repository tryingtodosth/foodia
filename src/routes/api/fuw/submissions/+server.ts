// POST /api/fuw/submissions — the anonymous write path of the /fuw cookbook form (docs/fuw.md).
// No account, deliberately; abuse protection instead: a honeypot, a per-IP-hash hourly cap,
// server-side caps on every field, and a staging table nothing public reads from.
import { json, error } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import {
	FUW_SUBMISSIONS_PER_HOUR,
	FuwValidationError,
	createFuwSubmission,
	hashClientIp,
	recentSubmissionCount,
	validateFuwInput
} from '$lib/server/fuw';
import type { RequestHandler } from './$types';

/** Whole-body cap, checked before parsing: the per-field caps can't help if the JSON itself is
 *  10 MB. */
const MAX_BODY_BYTES = 200 * 1024;

export const POST: RequestHandler = async ({ request, platform, getClientAddress }) => {
	if (!platform?.env?.DB) error(503, 'No backend available');

	const text = await request.text();
	if (text.length > MAX_BODY_BYTES) error(413, 'Submission is too large');
	let body: unknown;
	try {
		body = JSON.parse(text);
	} catch {
		error(400, 'Expected a JSON body');
	}

	let input;
	try {
		input = validateFuwInput(body);
	} catch (e) {
		if (e instanceof FuwValidationError) error(400, e.message);
		throw e;
	}

	// Honeypot: answer exactly like a success so a bot learns nothing, and store nothing.
	if (input.website?.trim()) return json({ id: crypto.randomUUID() }, { status: 201 });

	const db = getDb(platform);
	const ipHash = await hashClientIp(getClientAddress(), platform);
	if ((await recentSubmissionCount(db, ipHash)) >= FUW_SUBMISSIONS_PER_HOUR) {
		error(429, 'Too many submissions from this network in the last hour — please try again later');
	}

	try {
		const id = await createFuwSubmission(db, input, ipHash);
		return json({ id }, { status: 201 });
	} catch (e) {
		if (e instanceof FuwValidationError) error(400, e.message);
		throw e;
	}
};
