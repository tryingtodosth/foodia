// The persisted half of real unit conversion (lib/utils/units.ts's own header comment explains
// why cross-family conversion needs this at all). A cook is asked "how is flour usually measured?"
// at most ONCE — the answer is cached here, keyed by the ingredient's own normalized name, and
// every future cup<->gram conversion for that ingredient reuses it silently. Without this cache the
// same question would resurface on every shopping list, which is what would have made "ask instead
// of guessing" annoying rather than genuinely useful. Client-only, localStorage-backed — same lazy-
// hydrate discipline as pantry.svelte.ts/mealPlan.svelte.ts, for the same SSR-hydration-mismatch
// reason.
import type { DensityClass } from '$lib/types/units';
import { readJSON, writeJSON } from '$lib/utils/storage';

const STORAGE_KEY = 'foodia-ingredient-density';

function normalizeName(name: string): string {
	return name.trim().toLowerCase();
}

let classes = $state<Record<string, DensityClass>>({});
let hydrated = $state(false);

function persist() {
	writeJSON(STORAGE_KEY, classes);
}

export const ingredientDensityStore = {
	get hydrated(): boolean {
		return hydrated;
	},
	hydrate(): void {
		if (hydrated) return;
		classes = readJSON<Record<string, DensityClass>>(STORAGE_KEY) ?? {};
		hydrated = true;
	},
	classFor(ingredientName: string): DensityClass | undefined {
		return classes[normalizeName(ingredientName)];
	},
	classify(ingredientName: string, densityClass: DensityClass): void {
		classes = { ...classes, [normalizeName(ingredientName)]: densityClass };
		persist();
	}
};
