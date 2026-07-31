// GET /api/media/<key> — reads an object back out of R2 (Session 26). The bucket is private, so
// this route is the only way bytes ever leave it; that's deliberate (see wrangler.jsonc's own
// r2_buckets comment) and it's what keeps "one gated way in, one known way out" true.
//
// No auth check here, on purpose: what's stored is recipe photography, which is public content the
// moment its recipe is published — the same status every recipe name, ingredient, and step in this
// app already has. Keys are unguessable UUIDs rather than sequential ids, so this isn't an
// enumerable listing either. If a genuinely private media class ever exists (a user avatar on a
// private profile, say), it needs its own route with its own check, not a flag bolted onto this
// one.
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, platform, request }) => {
	if (!platform?.env?.MEDIA) error(503, 'No object storage available');
	const key = params.key;
	if (!key) error(400, 'Missing key');

	const object = await platform.env.MEDIA.get(key);
	if (!object) error(404, 'Not found');

	// Built by hand rather than via R2's own `object.writeHttpMetadata(headers)`: local `vite dev`
	// reaches R2 through wrangler's miniflare proxy, which serializes every argument, and a
	// `Headers` instance isn't serializable — it throws "Cannot stringify arbitrary non-POJOs" and
	// 500s the route. `httpMetadata` is a plain object, so reading the one field this route
	// actually needs works in both environments. Found by fetching a real uploaded image locally,
	// not by reading the type signature.
	const headers = new Headers();
	const contentType = object.httpMetadata?.contentType;
	if (contentType) headers.set('content-type', contentType);
	headers.set('etag', object.httpEtag);
	// Objects are written with a UUID key and never overwritten, so the bytes at a given key are
	// genuinely immutable — a year-long immutable cache is honest here, not optimistic.
	headers.set('cache-control', 'public, max-age=31536000, immutable');

	// Conditional GET handled here rather than through R2's own `onlyIf`, on purpose. Two real
	// incompatibilities made the built-in path the wrong tool: it rejects a quoted ETag (which is
	// exactly the form browsers send, per the HTTP spec, sometimes with a `W/` weak prefix), and it
	// takes only a single string where `If-None-Match` may legitimately list several. Comparing
	// here costs one R2 read on a 304, which at recipe-photo scale is worth far less than the
	// correctness — and unlike the built-in path, this actually works.
	const clientEtags = (request.headers.get('if-none-match') ?? '')
		.split(',')
		.map((tag) => tag.trim().replace(/^W\//, '').replace(/^"|"$/g, ''))
		.filter((tag) => tag.length > 0);
	if (clientEtags.includes('*') || clientEtags.includes(object.etag)) {
		return new Response(null, { status: 304, headers });
	}
	return new Response(object.body, { headers });
};
