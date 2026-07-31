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
import type { RequestHandler } from './$types';

/** Kept small on purpose — this is a recipe photo, not a media library. Cloudflare's own Workers
 *  request body limit on the free plan is 100 MB, far above this; the real constraint is that
 *  nothing about a hero image needs to be bigger. */
const MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'image/gif': 'gif'
} as const;
type AllowedType = keyof typeof ALLOWED;

/** Magic-number sniff. The declared type is checked against the allowlist first; this checks the
 *  bytes actually match that claim, so "image/png" wrapping something else doesn't get stored
 *  under a type this app will later hand back with an image Content-Type. */
function bytesMatchType(bytes: Uint8Array, type: AllowedType): boolean {
	const startsWith = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
	switch (type) {
		case 'image/jpeg':
			return startsWith(0xff, 0xd8, 0xff);
		case 'image/png':
			return startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
		case 'image/gif':
			return startsWith(0x47, 0x49, 0x46, 0x38);
		case 'image/webp':
			// RIFF....WEBP — the size field in between is what makes this two checks, not one.
			return startsWith(0x52, 0x49, 0x46, 0x46) && [0x57, 0x45, 0x42, 0x50].every((b, i) => bytes[8 + i] === b);
	}
}

export const POST: RequestHandler = async ({ request, platform, locals }) => {
	if (!platform?.env?.MEDIA) {
		error(503, 'No object storage available (the Capacitor build has none by design)');
	}
	if (!locals.user) error(401, 'You must be logged in to upload');
	// A real 403, distinct from the 401 above: "we know who you are, you don't have this
	// permission" is a different thing to tell a user than "log in", and the composer's own UI
	// renders a different message for each.
	if (!locals.user.canUpload) error(403, 'This account does not have upload permission');

	const form = await request.formData().catch(() => null);
	const file = form?.get('file');
	if (!(file instanceof File)) error(400, 'Expected a multipart form with a "file" field');

	const declared = file.type as AllowedType;
	if (!(declared in ALLOWED)) {
		error(415, `Unsupported image type "${file.type}" (allowed: ${Object.keys(ALLOWED).join(', ')})`);
	}
	if (file.size === 0) error(400, 'The file is empty');
	if (file.size > MAX_BYTES) {
		error(413, `File is ${Math.round(file.size / 1024)} KB; the limit is ${MAX_BYTES / 1024 / 1024} MB`);
	}

	const buffer = await file.arrayBuffer();
	// Re-check the real byte length, not just the File's own reported size — the two agree in every
	// normal case, and this costs nothing to be sure of.
	if (buffer.byteLength > MAX_BYTES) error(413, 'File exceeds the size limit');
	if (!bytesMatchType(new Uint8Array(buffer.slice(0, 16)), declared)) {
		error(415, 'File contents do not match the declared image type');
	}

	// The key carries the uploader's id as a path segment: it makes "whose file is this" answerable
	// from the key alone (an admin listing, a future per-user quota, a cleanup after a deleted
	// account) without a lookup table. The random suffix is what makes it unguessable — never the
	// original filename, which is attacker-controlled text.
	const key = `recipes/${locals.user.id}/${crypto.randomUUID()}.${ALLOWED[declared]}`;
	await platform.env.MEDIA.put(key, buffer, {
		httpMetadata: { contentType: declared, cacheControl: 'public, max-age=31536000, immutable' },
		customMetadata: { uploadedBy: locals.user.id, uploadedAt: new Date().toISOString() }
	});

	// The URL is this app's own serving route, not an r2.dev link — the bucket stays private, see
	// wrangler.jsonc's own r2_buckets comment.
	return json({ key, url: `/api/media/${key}` }, { status: 201 });
};
