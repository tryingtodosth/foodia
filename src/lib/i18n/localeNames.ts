// A curated locale-code → display-name lookup for CONTENT translations — deliberately a bigger
// list than the interface's own UI_LOCALES (lib/i18n/locales.ts): a community member can translate
// a recipe into a language the interface shell doesn't support yet, so this needs to name locales
// the interface itself never offers as a UI language. Falls back to the raw code for anything not
// in this curated list, rather than failing.
export const COMMON_CONTENT_LOCALES = ['pl', 'en', 'de', 'fr', 'es', 'uk'] as const;

const LOCALE_NAME: Record<string, string> = {
	pl: 'polski',
	en: 'English',
	de: 'Deutsch',
	fr: 'français',
	es: 'español',
	uk: 'українська'
};

export function localeName(code: string): string {
	return LOCALE_NAME[code] ?? code;
}
