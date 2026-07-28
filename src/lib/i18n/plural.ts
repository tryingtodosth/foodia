import type { UiLocale } from './locales';

export type PluralForm = 'one' | 'few' | 'other';

/**
 * CLDR cardinal plural categories. Polish genuinely has three forms — 1; 2-4 excluding the
 * 12-14 teens (which fall back to "many/other"); everything else — English only has two (1;
 * everything else). Not a full CLDR implementation (no support for locales with more categories,
 * e.g. Arabic's six), just enough to correctly pluralize this app's own two interface locales.
 */
export function pluralForm(locale: UiLocale, n: number): PluralForm {
	if (locale === 'pl') {
		if (n === 1) return 'one';
		const mod10 = n % 10;
		const mod100 = n % 100;
		if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return 'few';
		return 'other';
	}
	return n === 1 ? 'one' : 'other';
}
