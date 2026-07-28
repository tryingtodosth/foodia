import type { Handle } from '@sveltejs/kit';
import { isUiLocale, DEFAULT_UI_LOCALE, type UiLocale } from '$lib/i18n/locales';

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
 */
export const handle: Handle = async ({ event, resolve }) => {
	const cookieLocale = event.cookies.get(LOCALE_COOKIE);
	const locale: UiLocale = isUiLocale(cookieLocale)
		? cookieLocale
		: (detectFromAcceptLanguage(event.request.headers.get('accept-language')) ?? DEFAULT_UI_LOCALE);

	event.locals.locale = locale;

	return resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%lang%', locale)
	});
};
