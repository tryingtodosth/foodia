// The manual weekly planner (CLAUDE.md 6.2's P1.5 slice, pulled forward ahead of the real AI
// Meal Planning Wizard — see routes/plan/+page.svelte's own "quickFill" for the honest,
// non-AI stand-in). Client-only, localStorage-backed, keyed by `weekStart`. Same lazy-hydrate
// discipline as profile.svelte.ts/pantry.svelte.ts, for the same reason: reading localStorage at
// module load would make the client's very first render disagree with SSR's (always-empty) one.
import type { MealPlan, MealSlotKind } from '$lib/types/pantry';
import { readJSON, writeJSON } from '$lib/utils/storage';
import { currentUserRef } from './profile.svelte';
import { weekDates } from '$lib/utils/week';

const STORAGE_KEY = 'foodia-mealplans';

let plansByWeek = $state<Record<string, MealPlan>>({});
let hydrated = $state(false);

function emptyPlan(weekStart: string): MealPlan {
	return {
		id: weekStart,
		userId: currentUserRef().id,
		weekStart,
		days: weekDates(weekStart).map((date) => ({ date, meals: [] }))
	};
}

/** Backfills `id` on any meal saved by a pre-Session-23 version of this store — real users'
 *  existing localStorage plans have `MealSlot` rows with no `id` at all (it didn't exist as a
 *  field yet). Runs once, at hydrate time, so every meal this store ever hands out afterward can
 *  be trusted to have one, rather than every read site needing its own defensive fallback. */
function migrateMissingIds(plans: Record<string, MealPlan>): Record<string, MealPlan> {
	let changed = false;
	const migrated: Record<string, MealPlan> = {};
	for (const [weekStart, plan] of Object.entries(plans)) {
		migrated[weekStart] = {
			...plan,
			days: plan.days.map((day) => ({
				...day,
				meals: day.meals.map((meal) => {
					if (meal.id) return meal;
					changed = true;
					return { ...meal, id: crypto.randomUUID() };
				})
			}))
		};
	}
	if (changed) writeJSON(STORAGE_KEY, migrated);
	return migrated;
}

function persist() {
	writeJSON(STORAGE_KEY, plansByWeek);
}

function withPlan(weekStart: string, updater: (plan: MealPlan) => MealPlan): void {
	const current = plansByWeek[weekStart] ?? emptyPlan(weekStart);
	plansByWeek = { ...plansByWeek, [weekStart]: updater(current) };
	persist();
}

export const mealPlanStore = {
	get hydrated(): boolean {
		return hydrated;
	},
	hydrate(): void {
		if (hydrated) return;
		plansByWeek = migrateMissingIds(readJSON<Record<string, MealPlan>>(STORAGE_KEY) ?? {});
		hydrated = true;
	},
	/** Never undefined — a week nobody has touched yet is a real, empty 7-day plan, not a loading state. */
	planFor(weekStart: string): MealPlan {
		return plansByWeek[weekStart] ?? emptyPlan(weekStart);
	},
	setBudget(weekStart: string, budget: { amount: number; currency: string } | undefined): void {
		withPlan(weekStart, (plan) => ({ ...plan, budget }));
	},
	/** Session 23 — ADDS a new meal, no longer replaces whatever else is in that slot. Any number
	 *  of meals can now share a (date, slot) — "no limit on the amount of meals in the planner," a
	 *  direct ask. Defaults to 1 serving, not 2 — "by default the weekly planner should assume 1
	 *  person," the other direct ask; a real single-person household is this app's own honest
	 *  default, not an arbitrary couple-sized guess. */
	assign(weekStart: string, date: string, slot: MealSlotKind, recipeId: string, servings = 1): void {
		withPlan(weekStart, (plan) => ({
			...plan,
			days: plan.days.map((d) =>
				d.date === date
					? { ...d, meals: [...d.meals, { id: crypto.randomUUID(), slot, recipeId, servings }] }
					: d
			)
		}));
	},
	/** Targets one specific meal by its own id — a plain (date, slot) pair is no longer unique now
	 *  that several meals can share a slot. */
	remove(weekStart: string, date: string, mealId: string): void {
		withPlan(weekStart, (plan) => ({
			...plan,
			days: plan.days.map((d) =>
				d.date === date ? { ...d, meals: d.meals.filter((m) => m.id !== mealId) } : d
			)
		}));
	},
	updateServings(weekStart: string, date: string, mealId: string, servings: number): void {
		withPlan(weekStart, (plan) => ({
			...plan,
			days: plan.days.map((d) =>
				d.date === date
					? { ...d, meals: d.meals.map((m) => (m.id === mealId ? { ...m, servings } : m)) }
					: d
			)
		}));
	},
	clearDay(weekStart: string, date: string): void {
		withPlan(weekStart, (plan) => ({
			...plan,
			days: plan.days.map((d) => (d.date === date ? { ...d, meals: [] } : d))
		}));
	}
};
