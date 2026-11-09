// POST /api/fuw/uploads — anonymous photo upload for the /fuw cookbook form only (docs/fuw.md).
// The account route (/api/uploads) is gated on `can_upload`; this one can't be, so it is gated
// differently: the same byte-level validation (lib/server/media.ts), an hourly cap per IP hash,
// and — the part that matters — the object is NOT publicly served until an admin accepts the
// submission it's attached to (api/media's own `fuw/` gate). An abuser can fill a private
// bucket prefix; they can't use it to host anything.
import { json, error } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { readValidatedImage } from '$lib/server/media';
import { FUW_UPLOADS_PER_HOUR, hashClientIp, recentUploadCount, recordFuwUpload } from '$lib/server/fuw';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, platform, getClientAddress }) => {
	if (!platform?.env?.MEDIA || !platform.env.DB) error(503, 'No object storage available');

	const db = getDb(platform);
	const ipHash = await hashClientIp(getClientAddress(), platform);
	if ((await recentUploadCount(db, ipHash)) >= FUW_UPLOADS_PER_HOUR) {
		error(429, 'Too many uploads from this network in the last hour — please try again later');
	}

	const { buffer, type, ext } = await readValidatedImage(request);
	const key = `fuw/${crypto.randomUUID()}.${ext}`;
	await platform.env.MEDIA.put(key, buffer, {
		httpMetadata: { contentType: type },
		customMetadata: { source: 'fuw', uploadedAt: new Date().toISOString() }
	});
	await recordFuwUpload(db, key, ipHash);

	return json({ key, url: `/api/media/${key}` }, { status: 201 });
};
