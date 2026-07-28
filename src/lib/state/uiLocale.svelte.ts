// The current interface locale — this app's 4th `.svelte.ts` rune store (after profile/pantry/
// mealPlan), same "object of getters + methods wrapping module-level $state" idiom. Seeded
// server-side per request (see hooks.server.ts's cookie/Accept-Language detection, threaded
// through the root +layout.server.ts / +layout.svelte), then owned client-side by
// LanguageSwitcher.svelte for the rest of the session — switching is instant (no reload), and
// persisted via a cookie (lib/utils/cookies.ts) so the NEXT fresh page load starts in the right
// language too. Deliberately a plain string default here, not read from anywhere at module scope
// — the real initial value always comes from the root layout's own top-level `set()` call, which
// runs identically during SSR and the client's very first render, so there's no hydration
// mismatch to worry about (unlike profile/pantry, which start empty and hydrate later).
import { DEFAULT_UI_LOCALE, type UiLocale } from '$lib/i18n/locales';

let locale = $state<UiLocale>(DEFAULT_UI_LOCALE);

export const uiLocaleStore = {
	get locale(): UiLocale {
		return locale;
	},
	set(next: UiLocale): void {
		locale = next;
	}
};
