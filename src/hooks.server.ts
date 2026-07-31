import type { Handle } from '@sveltejs/kit';
import { isUiLocale, DEFAULT_UI_LOCALE, type UiLocale } from '$lib/i18n/locales';
import { getDb } from '$lib/server/db';
import { validateSession, SESSION_COOKIE } from '$lib/server/auth/session';
import { isAdminUser } from '$lib/server/auth/admin';

const LOCALE_COOKIE = 'foodia-locale';

function detectFromAcceptLanguage(header: string | null): UiLocale | null {
	if (!header) return null;
	const lower = header.toLowerCase();
	// A real Accept-Language header lists multiple weighted tags ("en-US,en;q=0.9,pl;q=0.8") — a
	// plain substring check is good enough for 2 supported locales, not a full q-value parser.
	if (lower.includes('en')) return 'en';
	if (lower.includes('pl')) return 'pl';
	return null;
}

/**
 * Resolves the interface locale once per request — cookie first (an explicit, remembered choice
 * always wins), then the browser's own Accept-Language signal, then the app's stated default
 * (CLAUDE.md 8B's "Polish market-first" assumption). Both languages ship symmetrically now that a
 * real switcher exists, so this default is a starting point, not a product decision favoring one
 * language over the other.
 *
 * Session 26 also resolves the *viewer* here, which this app deliberately never did before: every
 * auth-shaped check until now was client-side (`auth.svelte.ts` calling `/api/auth/me` after
 * mount), which is fine for chrome like "show the Moderacja link" but is not a gate — a client can
 * simply not run the check. `/admin` is a real gate, so the identity has to be resolved before any
 * load function runs, on the server, per request. Doing it in `handle` (rather than inside
 * `/admin`'s own load) also means every server route from here on can just read `locals.user`
 * instead of re-implementing cookie validation, which is exactly how a route ends up accidentally
 * skipping it.
 */
export const handle: Handle = async ({ event, resolve }) => {
	const cookieLocale = event.cookies.get(LOCALE_COOKIE);
	const locale: UiLocale = isUiLocale(cookieLocale)
		? cookieLocale
		: (detectFromAcceptLanguage(event.request.headers.get('accept-language')) ?? DEFAULT_UI_LOCALE);

	event.locals.locale = locale;

	// No D1 binding at all is the normal, expected state during the Capacitor build's prerender
	// crawl (adapter-static implements no `emulate()`, so there is no `platform` — see
	// lib/server/api/client.ts's own header comment). Anonymous is the correct answer there, not an
	// error: that build's auth path is the client-side mock one, by design.
	event.locals.user = null;
	if (event.platform?.env?.DB) {
		try {
			event.locals.user = await validateSession(
				getDb(event.platform),
				event.cookies.get(SESSION_COOKIE)
			);
		} catch {
			// A failed session lookup degrades to "anonymous", never to a 500 that takes a public
			// page down with it — every route already handles a null user.
			event.locals.user = null;
		}
	}
	event.locals.isAdmin = isAdminUser(event.locals.user, event.platform);

	return resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%lang%', locale)
	});
};
