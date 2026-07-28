// The interface-string lookup. Reads `uiLocaleStore.locale` (a rune getter) on every call rather
// than taking a locale parameter — same "plain function reads a reactive getter, reactivity flows
// through whatever calls it" pattern 2do documents for its own `canViewingAs()`. Called directly
// inside template expressions or `$derived`, both tracked contexts, so the UI re-renders the
// instant the locale changes with zero extra wiring at each call site.
import { uiLocaleStore } from '$lib/state/uiLocale.svelte';
import { messages, type MessageKey } from './messages';
import { pluralForm } from './plural';

function interpolate(template: string, vars?: Record<string, string | number>): string {
	if (!vars) return template;
	return template.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));
}

export function t(key: MessageKey, vars?: Record<string, string | number>): string {
	const dict: Record<string, string> = messages[uiLocaleStore.locale];
	const template = dict[key] ?? messages.pl[key] ?? key;
	return interpolate(template, vars);
}

/**
 * `t()` for a base key with `.one`/`.few`/`.other` variants — e.g. `translatePlural('pl', 'home.hiddenNote', 3)`
 * looks up `home.hiddenNote.few`. Falls back to `.other` when a locale doesn't define `.few`
 * (English's own dictionary entries for `.few` are just a copy of `.other` — see messages.ts's own
 * header comment on why, kept explicit rather than omitted so a missing-key fallback here never
 * silently masks a real typo in the base key).
 */
export function tPlural(baseKey: string, n: number, vars?: Record<string, string | number>): string {
	const form = pluralForm(uiLocaleStore.locale, n);
	const dict: Record<string, string> = messages[uiLocaleStore.locale];
	const key = `${baseKey}.${form}`;
	const fallbackKey = `${baseKey}.other`;
	const template = dict[key] ?? dict[fallbackKey] ?? key;
	return interpolate(template, { ...vars, n });
}
