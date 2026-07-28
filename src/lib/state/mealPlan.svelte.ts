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
		plansByWeek = readJSON<Record<string, MealPlan>>(STORAGE_KEY) ?? {};
		hydrated = true;
	},
	/** Never undefined — a week nobody has touched yet is a real, empty 7-day plan, not a loading state. */
	planFor(weekStart: string): MealPlan {
		return plansByWeek[weekStart] ?? emptyPlan(weekStart);
	},
	setBudget(weekStart: string, budget: { amount: number; currency: string } | undefined): void {
		withPlan(weekStart, (plan) => ({ ...plan, budget }));
	},
	/** At most one recipe per (date, slot) — assigning again replaces whatever was there. */
	assign(weekStart: string, date: string, slot: MealSlotKind, recipeId: string, servings = 2): void {
		withPlan(weekStart, (plan) => ({
			...plan,
			days: plan.days.map((d) =>
				d.date === date
					? { ...d, meals: [...d.meals.filter((m) => m.slot !== slot), { slot, recipeId, servings }] }
					: d
			)
		}));
	},
	remove(weekStart: string, date: string, slot: MealSlotKind): void {
		withPlan(weekStart, (plan) => ({
			...plan,
			days: plan.days.map((d) =>
				d.date === date ? { ...d, meals: d.meals.filter((m) => m.slot !== slot) } : d
			)
		}));
	},
	updateServings(weekStart: string, date: string, slot: MealSlotKind, servings: number): void {
		withPlan(weekStart, (plan) => ({
			...plan,
			days: plan.days.map((d) =>
				d.date === date
					? { ...d, meals: d.meals.map((m) => (m.slot === slot ? { ...m, servings } : m)) }
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
