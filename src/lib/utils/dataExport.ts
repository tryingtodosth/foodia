// "Download my data" (CLAUDE.md Section 7 item 22 / FUTURES.md Section 9.3) — the cheapest, most
// repeatedly-flagged trust feature this app hasn't built yet. Directly responsive to the real
// user-research finding in FUTURES.md Section 8 (the RecipeBox story: a company's unilateral
// pricing change caused permanent loss of years of users' own archived data) — the whole point is
// that this works with zero backend, reading exactly the three keys every store in this app
// already persists to via storage.ts's own readJSON, not a reinterpretation of them.
//
// Deliberately scoped to export only, not delete — a real "delete everything" affordance belongs
// to the fuller Privacy surface FUTURES.md 9.3 describes and picks a direction for, not built yet.
// Conflating the two here would make this small, standalone piece into a bigger one.
import { readJSON } from './storage';
import type { UserProfile } from '$lib/types/user';
import type { PantryItem, MealPlan } from '$lib/types/pantry';

export interface FoodiaDataExport {
	exportedAt: string;
	profile: UserProfile | null;
	pantry: PantryItem[];
	mealPlans: Record<string, MealPlan>;
}

/** Pure — reads the same three localStorage keys profile.svelte.ts/pantry.svelte.ts/
 *  mealPlan.svelte.ts already own, directly, rather than going through their reactive state. This
 *  is what "download my data" should mean literally: exactly what's persisted, not a store's
 *  current in-memory interpretation of it (which are the same thing in practice, but the former is
 *  the more honest claim to make about a data-export feature). */
export function buildDataExport(now: () => string = () => new Date().toISOString()): FoodiaDataExport {
	return {
		exportedAt: now(),
		profile: readJSON<UserProfile>('foodia-profile'),
		pantry: readJSON<PantryItem[]>('foodia-pantry') ?? [],
		mealPlans: readJSON<Record<string, MealPlan>>('foodia-mealplans') ?? {}
	};
}

/** True once there's anything at all worth downloading — an empty export is a real, honest state
 *  to show a distinct message for, not a broken/loading one. */
export function hasExportableData(data: FoodiaDataExport): boolean {
	return data.profile !== null || data.pantry.length > 0 || Object.keys(data.mealPlans).length > 0;
}

/** SSR-guarded, fails soft — same discipline shoppingExport.ts's own copyToClipboard already
 *  carries for a browser API that isn't guaranteed to exist in every context. */
export function downloadDataExport(data: FoodiaDataExport): boolean {
	if (typeof window === 'undefined' || typeof document === 'undefined') return false;
	try {
		const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = `foodia-dane-${data.exportedAt.slice(0, 10)}.json`;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(url);
		return true;
	} catch {
		return false;
	}
}
