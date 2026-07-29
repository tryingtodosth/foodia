// Chooses the real D1-backed client when a live D1 binding exists, falling back to the mock
// fixtures otherwise — the one thing that makes it safe for every `+page.server.ts` route below to
// share the same load-function code across BOTH build targets. The default (Cloudflare Pages)
// build genuinely has `platform.env.DB` at request time; the Capacitor static build's own
// prerender crawl has no `platform` at all (adapter-static implements no `emulate()`), and can't
// ever have one — a static, offline-capable native bundle has no live Workers runtime to bind D1
// to, by definition (CLAUDE.md 6.1's own "no server at runtime, full stop"). Falling back to
// `mockApiClient` there isn't a workaround, it's the only architecturally honest option — the same
// "flag rather than fake" discipline this app already applies everywhere else.
import { mockApiClient } from '$lib/api/mock';
import { createDbApiClient } from './dbApiClient';
import { getDb } from '../db';
import type { RecipeApiClient } from '$lib/api/client';

export function getRecipeApiClient(platform: App.Platform | undefined): RecipeApiClient {
	if (platform?.env?.DB) return createDbApiClient(getDb(platform));
	return mockApiClient;
}
