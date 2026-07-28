// Interface language (UI chrome) — deliberately a separate axis from content translation
// (lib/utils/translations.ts): a small, curated, developer-maintained set of strings for the app
// shell itself, vs. an unbounded, community-submitted set of translations for recipe content.
// Same "two axes, not one stretched to cover both" split 2do's own CLAUDE.md documents.
export const UI_LOCALES = ['pl', 'en'] as const;
export type UiLocale = (typeof UI_LOCALES)[number];

export const UI_LOCALE_LABEL: Record<UiLocale, string> = {
	pl: 'Polski',
	en: 'English'
};

export const DEFAULT_UI_LOCALE: UiLocale = 'pl';

export function isUiLocale(value: string | undefined | null): value is UiLocale {
	return value === 'pl' || value === 'en';
}
