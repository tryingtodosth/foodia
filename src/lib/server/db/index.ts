// A drizzle client can't be a module-level singleton here the way it could with a long-lived
// server process — the D1 binding only exists per-request, on `event.platform.env.DB` (Cloudflare
// Pages Functions/Workers convention, not a SvelteKit-specific one). Every server route calls
// `getDb(platform)` itself; drizzle's own client construction is cheap (no connection pool to
// spin up — D1's binding IS the connection), so there's no real cost to doing this per-request.
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

export function getDb(platform: App.Platform | undefined) {
	if (!platform?.env?.DB) {
		throw new Error(
			'D1 binding "DB" is not available on event.platform — see wrangler.jsonc\'s d1_databases entry. ' +
				'Local `vite dev` gets this automatically via adapter-cloudflare\'s platform emulation; ' +
				'if it\'s still missing, confirm wrangler.jsonc has the binding and restart the dev server.'
		);
	}
	return drizzle(platform.env.DB, { schema });
}

export type Db = ReturnType<typeof getDb>;
