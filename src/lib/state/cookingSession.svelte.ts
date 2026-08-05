// This app's 10th `.svelte.ts` rune store, and the first one that exists to make a FLOW resumable
// rather than to hold a list of things (CLAUDE.md 4.3's own Cooking Mode was, until now, the only
// genuinely multi-step activity in Foodia with no state of its own outside the component rendering
// it — start it, get a phone call, come back, and you're on step 1 with no record that steps 1-4
// already happened).
//
// Persisted to localStorage, unlike `stepAlternatives.svelte.ts`'s deliberately tab-lifetime-only
// store. That's a real difference in kind, not an inconsistency: a session-proposed step
// alternative is a draft contribution that a reload legitimately discards, whereas "I am 4 steps
// into cooking dinner" is a fact about the physical world that a reload has no business forgetting.
// Same lazy-hydrate discipline as profile/pantry/mealPlan, for the same SSR-mismatch reason.
//
// Keyed by recipe id — a cook genuinely can have two things going at once (a main and a dessert),
// and keying by recipe means the resume affordance on /recipes/[id] and /plan needs no lookup at
// all. There is deliberately no "the one active session" singleton for the same reason.
import type {
	CookingSession,
	CookingSessionPlanContext,
	CookingSubstitutionChoice,
	CookingTimer
} from '$lib/types/cooking';
import { readJSON, writeJSON } from '$lib/utils/storage';

const STORAGE_KEY = 'foodia-cooking-sessions';

let sessionsByRecipeId = $state<Record<string, CookingSession>>({});
let hydrated = $state(false);

function persist() {
	writeJSON(STORAGE_KEY, sessionsByRecipeId);
}

function touch(recipeId: string, updater: (session: CookingSession) => CookingSession): void {
	const current = sessionsByRecipeId[recipeId];
	if (!current) return;
	sessionsByRecipeId = {
		...sessionsByRecipeId,
		[recipeId]: { ...updater(current), updatedAt: new Date().toISOString() }
	};
	persist();
}

export const cookingSessionStore = {
	get hydrated(): boolean {
		return hydrated;
	},
	/** Every live session, most recently touched first — what a "you left something on the stove"
	 *  resume list would read. */
	get all(): CookingSession[] {
		return Object.values(sessionsByRecipeId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	},
	hydrate(): void {
		if (hydrated) return;
		sessionsByRecipeId = readJSON<Record<string, CookingSession>>(STORAGE_KEY) ?? {};
		hydrated = true;
	},
	forRecipe(recipeId: string): CookingSession | undefined {
		return sessionsByRecipeId[recipeId];
	},
	/**
	 * Starts a session, or leaves an in-progress one exactly as it is. **Resuming is the default and
	 * clobbering has to be asked for** (`restart: true`) — the whole point of this store is that
	 * re-entering Cooking Mode from a link, a reload, or the plan must not silently throw away where
	 * the cook actually was. `seed` is only ever applied to a genuinely new session: the substitution
	 * choices made on the recipe page are the starting assumption for a cook, not an override of
	 * what they've already decided at the stove.
	 */
	start(
		input: {
			recipeId: string;
			recipeName: string;
			stepCount: number;
		},
		seed?: {
			substitutions?: Record<string, CookingSubstitutionChoice>;
			planContext?: CookingSessionPlanContext;
			restart?: boolean;
		}
	): CookingSession {
		const existing = sessionsByRecipeId[input.recipeId];
		if (existing && !seed?.restart && !existing.finishedAt) {
			// A plan context arriving on a resume IS worth adopting — it means the cook came back in
			// via a specific planned meal this time, and finishing should tick that meal off. Nothing
			// else about an in-progress session is overwritten.
			if (seed?.planContext && !existing.planContext) {
				touch(input.recipeId, (s) => ({ ...s, planContext: seed.planContext }));
				return sessionsByRecipeId[input.recipeId];
			}
			return existing;
		}
		const now = new Date().toISOString();
		const session: CookingSession = {
			recipeId: input.recipeId,
			recipeName: input.recipeName,
			startedAt: now,
			updatedAt: now,
			stepIndex: 0,
			stepCount: input.stepCount,
			doneStepIds: [],
			substitutions: seed?.substitutions ? { ...seed.substitutions } : {},
			planContext: seed?.planContext
		};
		sessionsByRecipeId = { ...sessionsByRecipeId, [input.recipeId]: session };
		persist();
		return session;
	},
	/** Moving to a step also records the step being LEFT as done — advancing past a step is the only
	 *  honest signal this app has that it actually happened, and it's the signal the cook already
	 *  gives naturally by tapping onward. Tapping back to re-read an earlier step deliberately does
	 *  not un-finish anything. */
	goToStep(recipeId: string, nextIndex: number, leavingStepId?: string): void {
		touch(recipeId, (session) => {
			const doneStepIds =
				leavingStepId && nextIndex > session.stepIndex && !session.doneStepIds.includes(leavingStepId)
					? [...session.doneStepIds, leavingStepId]
					: session.doneStepIds;
			return { ...session, stepIndex: nextIndex, doneStepIds };
		});
	},
	setStepDone(recipeId: string, stepId: string, done: boolean): void {
		touch(recipeId, (session) => ({
			...session,
			doneStepIds: done
				? session.doneStepIds.includes(stepId)
					? session.doneStepIds
					: [...session.doneStepIds, stepId]
				: session.doneStepIds.filter((id) => id !== stepId)
		}));
	},
	/** `null` clears a swap back to the recipe's own ingredient. */
	recordSubstitution(recipeId: string, ingredientId: string, choice: CookingSubstitutionChoice | null): void {
		touch(recipeId, (session) => {
			const substitutions = { ...session.substitutions };
			if (choice) substitutions[ingredientId] = choice;
			else delete substitutions[ingredientId];
			return { ...session, substitutions };
		});
	},
	startTimer(recipeId: string, timer: CookingTimer): void {
		touch(recipeId, (session) => ({ ...session, timer }));
	},
	clearTimer(recipeId: string): void {
		touch(recipeId, (session) => ({ ...session, timer: undefined }));
	},
	/** Marks the session finished but deliberately KEEPS it — the finish screen still has to render
	 *  what was deducted and offer to undo it, and a session discarded at the moment of finishing
	 *  would leave that screen with nothing to describe. `discard` is the real end. */
	finish(recipeId: string): void {
		touch(recipeId, (session) => ({ ...session, finishedAt: new Date().toISOString() }));
	},
	discard(recipeId: string): void {
		if (!sessionsByRecipeId[recipeId]) return;
		const rest = { ...sessionsByRecipeId };
		delete rest[recipeId];
		sessionsByRecipeId = rest;
		persist();
	}
};
