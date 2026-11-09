// POST /api/uploads — the real R2 write path (Session 26), the first time this app stores bytes
// anywhere other than D1. Three gates, in order, all server-side:
//
//   1. a valid session (hooks.server.ts already resolved it — `locals.user`),
//   2. that user's own `can_upload` flag, default-off for every account ever created and grantable
//      only from /admin (schema.ts's own note), and
//   3. real content validation — declared MIME type in an allowlist, real byte length under a cap,
//      and a magic-number sniff of the actual bytes, because a `Content-Type` header is a claim by
//      the uploader, not a fact about the file.
//
// Deliberately NOT a presigned-URL/direct-to-R2 upload (FUTURES.md 9.5's own eventual design): a
// presigned URL hands the client a credential that bypasses gates 2 and 3 for its whole lifetime,
// which is the wrong trade for an app whose upload permission is the entire feature being asked
// for. Files here are small photos; proxying them through the Worker costs nothing that matters.
import { json, error } from '@sveltejs/kit';
import { readValidatedImage } from '$lib/server/media';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, platform, locals }) => {
	if (!platform?.env?.MEDIA) {
		error(503, 'No object storage available (the Capacitor build has none by design)');
	}
	if (!locals.user) error(401, 'You must be logged in to upload');
	// A real 403, distinct from the 401 above: "we know who you are, you don't have this
	// permission" is a different thing to tell a user than "log in", and the composer's own UI
	// renders a different message for each.
	if (!locals.user.canUpload) error(403, 'This account does not have upload permission');

	const { buffer, type: declared, ext } = await readValidatedImage(request);

	// The key carries the uploader's id as a path segment: it makes "whose file is this" answerable
	// from the key alone (an admin listing, a future per-user quota, a cleanup after a deleted
	// account) without a lookup table. The random suffix is what makes it unguessable — never the
	// original filename, which is attacker-controlled text.
	const key = `recipes/${locals.user.id}/${crypto.randomUUID()}.${ext}`;
	await platform.env.MEDIA.put(key, buffer, {
		httpMetadata: { contentType: declared, cacheControl: 'public, max-age=31536000, immutable' },
		customMetadata: { uploadedBy: locals.user.id, uploadedAt: new Date().toISOString() }
	});

	// The URL is this app's own serving route, not an r2.dev link — the bucket stays private, see
	// wrangler.jsonc's own r2_buckets comment.
	return json({ key, url: `/api/media/${key}` }, { status: 201 });
};
