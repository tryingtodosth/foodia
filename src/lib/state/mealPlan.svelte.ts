// The manual weekly planner (CLAUDE.md 6.2's P1.5 slice, pulled forward ahead of the real AI
// Meal Planning Wizard — see routes/plan/+page.svelte's own "quickFill" for the honest,
// non-AI stand-in). Client-only, localStorage-backed. Same lazy-hydrate discipline as
// profile.svelte.ts/pantry.svelte.ts, for the same reason: reading localStorage at module load
// would make the client's very first render disagree with SSR's (always-empty) one.
//
// Session 24 — plans keyed by their own `id`, not by `weekStart`. Before this, a "weekly plan" WAS
// its week (`plan.id === weekStart`, at most one per week); "allow more than 1 weekly plan" means
// several named plans can now target the same week (a normal-week draft alongside a guest-week
// one), switchable by name rather than implied by which week you're looking at.
import type { MealPlan, MealSlotKind } from '$lib/types/pantry';
import { readJSON, writeJSON } from '$lib/utils/storage';
import { currentUserRef } from './profile.svelte';
import { weekDates } from '$lib/utils/week';

const STORAGE_KEY = 'foodia-mealplans';

let plansById = $state<Record<string, MealPlan>>({});
let hydrated = $state(false);

function emptyPlan(weekStart: string, name: string): MealPlan {
	const now = new Date().toISOString();
	return {
		id: crypto.randomUUID(),
		name,
		userId: currentUserRef().id,
		weekStart,
		days: weekDates(weekStart).map((date) => ({ date, meals: [] })),
		createdAt: now,
		updatedAt: now
	};
}

/** Migrates both of this store's own prior shapes in one pass: (1) pre-Session-23 meals with no
 *  `id`, (2) pre-Session-24 plans keyed by `weekStart` with `id === weekStart` and no `name`/
 *  `createdAt`/`updatedAt`. Runs once, at hydrate time — every plan/meal this store ever hands out
 *  afterward can be trusted to have real ids, not every read site needing its own fallback. A
 *  migrated plan's default name is its own week-start date (always unique per legacy plan, no
 *  i18n dependency needed in a plain state module — renaming it is one click in the UI). */
function migrate(raw: Record<string, unknown>): Record<string, MealPlan> {
	let changed = false;
	const result: Record<string, MealPlan> = {};
	for (const value of Object.values(raw)) {
		const plan = value as Partial<MealPlan> & { id: string; weekStart: string; days: MealPlan['days'] };
		const needsNewId = !plan.name;
		if (needsNewId) changed = true;
		const id = needsNewId ? crypto.randomUUID() : plan.id;
		const now = new Date().toISOString();
		const days = plan.days.map((day) => ({
			...day,
			meals: day.meals.map((meal) => {
				if (meal.id) return meal;
				changed = true;
				return { ...meal, id: crypto.randomUUID() };
			})
		}));
		result[id] = {
			id,
			name: plan.name ?? plan.weekStart,
			userId: plan.userId ?? currentUserRef().id,
			weekStart: plan.weekStart,
			budget: plan.budget,
			days,
			createdAt: plan.createdAt ?? now,
			updatedAt: plan.updatedAt ?? now
		};
	}
	if (changed) writeJSON(STORAGE_KEY, result);
	return result;
}

function persist() {
	writeJSON(STORAGE_KEY, plansById);
}

function withPlan(planId: string, updater: (plan: MealPlan) => MealPlan): void {
	const current = plansById[planId];
	if (!current) return;
	plansById = { ...plansById, [planId]: { ...updater(current), updatedAt: new Date().toISOString() } };
	persist();
}

export const mealPlanStore = {
	get hydrated(): boolean {
		return hydrated;
	},
	hydrate(): void {
		if (hydrated) return;
		plansById = migrate(readJSON<Record<string, unknown>>(STORAGE_KEY) ?? {});
		hydrated = true;
	},
	/** Every plan targeting a given week, oldest first — zero, one, or many. Replaces the old
	 *  `planFor(weekStart)`, which could only ever return exactly one (real, if untouched-and-empty)
	 *  plan per week; callers now decide which of possibly several to show. */
	plansForWeek(weekStart: string): MealPlan[] {
		return Object.values(plansById)
			.filter((p) => p.weekStart === weekStart)
			.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
	},
	planById(planId: string): MealPlan | undefined {
		return plansById[planId];
	},
	/** Real creation, not an implicit "every week already has one" default anymore — returns the
	 *  new plan's id so the caller can select it immediately. */
	createPlan(weekStart: string, name: string): string {
		const plan = emptyPlan(weekStart, name);
		plansById = { ...plansById, [plan.id]: plan };
		persist();
		return plan.id;
	},
	/** Copies an existing plan's days/budget into a new, independent plan — the "saveable plan
	 *  history" half of "allow more than 1 weekly plan": reuse last week's plan as a template for a
	 *  future one, or fork the current week's plan into a second draft to compare against. Meals
	 *  keep their recipe/slot/servings but get fresh ids of their own (never share identity with the
	 *  source's meals); day dates are remapped onto the target week's own 7 dates by weekday
	 *  position when the target week differs from the source's. Returns the new plan's id, or `null`
	 *  if the source plan doesn't exist. */
	duplicatePlan(planId: string, name: string, targetWeekStart?: string): string | null {
		const source = plansById[planId];
		if (!source) return null;
		const weekStart = targetWeekStart ?? source.weekStart;
		const newDates = weekDates(weekStart);
		const now = new Date().toISOString();
		const copy: MealPlan = {
			id: crypto.randomUUID(),
			name,
			userId: source.userId,
			weekStart,
			budget: source.budget,
			days: source.days.map((day, i) => ({
				date: newDates[i],
				meals: day.meals.map((meal) => ({ ...meal, id: crypto.randomUUID() }))
			})),
			createdAt: now,
			updatedAt: now
		};
		plansById = { ...plansById, [copy.id]: copy };
		persist();
		return copy.id;
	},
	renamePlan(planId: string, name: string): void {
		withPlan(planId, (plan) => ({ ...plan, name }));
	},
	deletePlan(planId: string): void {
		if (!plansById[planId]) return;
		const rest = { ...plansById };
		delete rest[planId];
		plansById = rest;
		persist();
	},
	setBudget(planId: string, budget: { amount: number; currency: string } | undefined): void {
		withPlan(planId, (plan) => ({ ...plan, budget }));
	},
	/** Adds a new meal — any number of meals can share a (date, slot); assigning never replaces one
	 *  already there (Session 23). Defaults to 1 serving, a real single-person household default. */
	assign(planId: string, date: string, slot: MealSlotKind, recipeId: string, servings = 1): void {
		withPlan(planId, (plan) => ({
			...plan,
			days: plan.days.map((d) =>
				d.date === date
					? { ...d, meals: [...d.meals, { id: crypto.randomUUID(), slot, recipeId, servings }] }
					: d
			)
		}));
	},
	remove(planId: string, date: string, mealId: string): void {
		withPlan(planId, (plan) => ({
			...plan,
			days: plan.days.map((d) =>
				d.date === date ? { ...d, meals: d.meals.filter((m) => m.id !== mealId) } : d
			)
		}));
	},
	updateServings(planId: string, date: string, mealId: string, servings: number): void {
		withPlan(planId, (plan) => ({
			...plan,
			days: plan.days.map((d) =>
				d.date === date
					? { ...d, meals: d.meals.map((m) => (m.id === mealId ? { ...m, servings } : m)) }
					: d
			)
		}));
	},
	/**
	 * Ticks a planned meal off as actually cooked (or clears the tick with `cooked: false`) — what
	 * closes the loop from a cooking session back to the plan it came from.
	 *
	 * Clearing the mark deliberately does NOT put anything back into the pantry. The two actions are
	 * genuinely separate: the deduction is undoable from the cooking session's own finish screen,
	 * while it's still on screen and the cook can still see exactly what was spent. A "wasn't
	 * cooked after all" tap days later has no idea what was deducted or whether anything's been
	 * re-bought since, so silently crediting stock back would be inventing pantry contents — the
	 * one thing this app's pantry logic has consistently refused to do.
	 */
	markCooked(planId: string, date: string, mealId: string, cooked: boolean): void {
		withPlan(planId, (plan) => ({
			...plan,
			days: plan.days.map((d) =>
				d.date === date
					? {
							...d,
							meals: d.meals.map((m) =>
								m.id === mealId
									? { ...m, cookedAt: cooked ? new Date().toISOString() : undefined }
									: m
							)
						}
					: d
			)
		}));
	},
	clearDay(planId: string, date: string): void {
		withPlan(planId, (plan) => ({
			...plan,
			days: plan.days.map((d) => (d.date === date ? { ...d, meals: [] } : d))
		}));
	}
};
