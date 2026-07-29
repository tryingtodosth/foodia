// The client-safe `RecipeApiClient` implementation (CLAUDE.md Section 5, Session 16) — talks to
// the real `/api/recipes` routes over `fetch`, never touches D1 directly (that's
// `lib/server/api/dbApiClient.ts`, server-only). This is what components genuinely running in the
// browser use — today, only `/shopping-list` (its own `+page.svelte` calls `getManyDetails`
// directly, since that route deliberately has no `+page.server.ts` — see that file's own header
// comment on why). Every `+page.server.ts` load instead uses `dbApiClient` straight, skipping an
// unnecessary internal HTTP hop when the caller is already on the server.
import type { RecipeApiClient } from './client';
import type { RecipeCard, RecipeDetail } from '$lib/types/recipe';

async function fetchJson<T>(input: string, fetchFn: typeof fetch = fetch): Promise<T> {
	const res = await fetchFn(input);
	if (!res.ok) throw new Error(`Request failed (${res.status}): ${input}`);
	return res.json();
}

/** `fetchFn` defaults to the global `fetch`, but every method also accepts SvelteKit's own
 *  provided `fetch` (from `+page.ts`/component-level load functions) as an override — the same
 *  "accept an injectable fetch" convention SvelteKit's own docs recommend, since only that version
 *  correctly forwards cookies/handles relative URLs during SSR. */
export function createHttpApiClient(fetchFn: typeof fetch = fetch): RecipeApiClient {
	return {
		list: () => fetchJson<RecipeCard[]>('/api/recipes', fetchFn),
		listDetails: () => fetchJson<RecipeDetail[]>('/api/recipes?detail=full', fetchFn),
		getDetail: (id: string) => fetchJson<RecipeDetail>(`/api/recipes/${encodeURIComponent(id)}`, fetchFn),
		async getCard(id: string) {
			const { ingredients, steps, versions, comments, translations, description, ...card } =
				await this.getDetail(id);
			return card;
		},
		getManyDetails: (ids: string[]) =>
			ids.length === 0
				? Promise.resolve([])
				: fetchJson<RecipeDetail[]>(`/api/recipes?ids=${ids.map(encodeURIComponent).join(',')}`, fetchFn)
	};
}

/** The default instance, using the global `fetch` — fine for client-only call sites
 *  (`/shopping-list`) that never run during SSR. */
export const httpApiClient: RecipeApiClient = createHttpApiClient();
