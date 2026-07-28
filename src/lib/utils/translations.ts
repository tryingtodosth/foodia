// Content translation resolution (as opposed to lib/i18n/, which is the INTERFACE'S own language
// — two deliberately separate axes, same split 2do's own CLAUDE.md documents: a small, curated,
// developer-maintained set of UI strings vs. an unbounded, community-submitted set of translations
// for user-generated recipe content).
//
// Framework-agnostic, no Svelte import — pure functions over data, same discipline
// substitution.ts/hardware.ts/week.ts already follow.
import type { RecipeDetail, Translation, TranslatableField } from '$lib/types/recipe';

export interface ResolvedRecipeContent {
	isOriginal: boolean;
	/** True only when `translation` is set AND its locale equals the recipe's own sourceLocale —
	 *  a community-suggested revision of the original text, not a foreign-language translation.
	 *  Computed once here so the UI layer never has to re-derive it. */
	isSameLocaleSuggestion: boolean;
	locale: string;
	fields: Record<TranslatableField, string>;
	translation?: Translation;
}

export interface RecipeVersionOption {
	key: string; // 'original', or the winning Translation's own id for that locale
	locale: string;
	isOriginal: boolean;
	/** locale === sourceLocale, but this ISN'T the literal original — a community-suggested
	 *  revision of the original text, in the original's own language. Never auto-applied by
	 *  `resolveRecipeVersion`'s hierarchy walk; only reachable via an explicit `versionKey` pick. */
	isSameLocaleSuggestion: boolean;
	translation?: Translation;
}

function pickBestTranslation(candidates: Translation[]): Translation | undefined {
	if (candidates.length === 0) return undefined;
	return [...candidates].sort((a, b) => {
		const scoreA = (a.reactions?.upCount ?? 0) - (a.reactions?.downCount ?? 0);
		const scoreB = (b.reactions?.upCount ?? 0) - (b.reactions?.downCount ?? 0);
		if (scoreB !== scoreA) return scoreB - scoreA;
		return Date.parse(b.createdAt) - Date.parse(a.createdAt);
	})[0];
}

function originalFieldsOf(recipe: RecipeDetail): Record<TranslatableField, string> {
	return { name: recipe.name, summary: recipe.summary, description: recipe.description };
}

/**
 * Every selectable version of a recipe: the true original, plus one entry per distinct locale
 * that has at least one Translation — competing submissions for the same locale collapse to the
 * single highest-reacted one (ties broken by newest), same "the picker is a list of versions, not
 * of every competing row" simplification 2do's own multi-locale picker documents. A same-locale
 * "improve the original" suggestion is just another entry here, distinguished by
 * `isSameLocaleSuggestion` so the UI can label it differently from a real foreign translation.
 */
export function getRecipeVersions(
	recipe: RecipeDetail,
	extraTranslations: Translation[] = []
): RecipeVersionOption[] {
	const sourceLocale = recipe.sourceLocale ?? 'pl';
	const all = [...(recipe.translations ?? []), ...extraTranslations];

	const versions: RecipeVersionOption[] = [
		{ key: 'original', locale: sourceLocale, isOriginal: true, isSameLocaleSuggestion: false }
	];

	const byLocale = new Map<string, Translation[]>();
	for (const tr of all) {
		const list = byLocale.get(tr.locale) ?? [];
		list.push(tr);
		byLocale.set(tr.locale, list);
	}

	for (const [locale, candidates] of byLocale) {
		const best = pickBestTranslation(candidates);
		if (!best) continue;
		versions.push({
			key: best.id,
			locale,
			isOriginal: false,
			isSameLocaleSuggestion: locale === sourceLocale,
			translation: best
		});
	}

	return versions;
}

/**
 * Resolves what to actually render. `versionKey` (from an explicit picker choice) wins outright
 * when given, including a same-locale "suggested revision" — the ONE case that mechanism can ever
 * surface, since the automatic path below deliberately never substitutes one for the real
 * original. Without an explicit pick, walks `hierarchy` (a language preference order — this app
 * passes just `[uiLocaleStore.locale]`, a single-entry hierarchy, not a separate ranked content-
 * language preference list the way 2do's own system has; a deliberate, smaller scope for now, see
 * CLAUDE.md): a locale equal to the recipe's own `sourceLocale` always resolves to the TRUE
 * original, full stop — a community same-locale suggestion is only ever shown by explicit choice,
 * never silently presented as "the original."
 */
export function resolveRecipeVersion(
	recipe: RecipeDetail,
	hierarchy: string[],
	versionKey: string | null = null,
	extraTranslations: Translation[] = []
): ResolvedRecipeContent {
	const sourceLocale = recipe.sourceLocale ?? 'pl';
	const originalFields = originalFieldsOf(recipe);
	const versions = getRecipeVersions(recipe, extraTranslations);

	if (versionKey) {
		const picked = versions.find((v) => v.key === versionKey);
		if (picked && !picked.isOriginal && picked.translation) {
			return {
				isOriginal: false,
				isSameLocaleSuggestion: picked.isSameLocaleSuggestion,
				locale: picked.locale,
				fields: { ...originalFields, ...picked.translation.fields },
				translation: picked.translation
			};
		}
		// versionKey === 'original', or an unresolvable key — fall through to the true original.
		return { isOriginal: true, isSameLocaleSuggestion: false, locale: sourceLocale, fields: originalFields };
	}

	for (const locale of hierarchy) {
		if (locale === sourceLocale) {
			return { isOriginal: true, isSameLocaleSuggestion: false, locale: sourceLocale, fields: originalFields };
		}
		const match = versions.find((v) => v.locale === locale && !v.isOriginal);
		if (match && match.translation) {
			return {
				isOriginal: false,
				isSameLocaleSuggestion: false,
				locale,
				fields: { ...originalFields, ...match.translation.fields },
				translation: match.translation
			};
		}
	}

	return { isOriginal: true, isSameLocaleSuggestion: false, locale: sourceLocale, fields: originalFields };
}
