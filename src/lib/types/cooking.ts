// A cooking SESSION, as opposed to the cooking SCREEN (CLAUDE.md 4.3). Until now those were the
// same thing: `CookingMode.svelte` held `currentIndex` in plain component `$state`, so the whole
// notion of "where am I in this recipe" lived for exactly as long as that component was mounted. A
// reload, a phone call, a tap on the browser's back button — step 1 of N again, with nothing
// recording that the first four steps had already happened.
//
// This type is what makes cooking a real, resumable, multi-step activity instead of a view:
// something you can start, leave, come back to, and finish — where "finish" is a real event with
// real consequences (the pantry deduction that closes the plan -> shopping-list -> pantry loop,
// FUTURES.md Section 1 item 4), not just arriving at the last step and having nothing left to tap.
//
// Deliberately denormalized (`recipeName`, `stepCount`, each swap's own `name`/`ratio`): a resume
// banner on /plan or /recipes/[id] must be able to say "krok 3/5 — Spaghetti Bolognese" from
// localStorage alone, without fetching the recipe first. The same "carry a label, avoid a lookup"
// convention `CommentReport` already established for the moderation queue (CLAUDE.md 4.4).

/** One ingredient the cook actually swapped mid-recipe — the "I substituted X" half of a real
 *  cooking session. Carries the substitution's own `ratio` because that's what decides how much of
 *  the REPLACEMENT was really used (Substitution.ratio is "conversion factor against the original
 *  quantity", Section 3), and the pantry deduction at the end has to spend the thing that was
 *  actually used, not the thing the recipe originally asked for. */
export interface CookingSubstitutionChoice {
	ingredientId: string;
	substitutionId: string;
	/** The replacement's own name, denormalized — the deduction matches pantry rows BY NAME, and a
	 *  finished session has to stay meaningful even if that substitution row is later removed. */
	name: string;
	ratio: number;
}

/** A running timer, stored as the absolute moment it ends rather than as a remaining-seconds
 *  countdown. Two real reasons, not one: (1) a countdown integer can't survive a reload at all,
 *  which makes "leave and come back" a lie for exactly the steps where it matters most (a 25-minute
 *  simmer); (2) the previous `timerSecondsLeft -= 1` in a `setInterval` drifts badly the moment a
 *  mobile browser throttles a backgrounded tab — it under-counts by however long the tab was
 *  suspended, so the timer silently finishes late. An absolute end time is correct on return
 *  regardless of what the OS did to the tab in between. It still doesn't RING while backgrounded —
 *  that needs Capacitor Local Notifications (Section 7 item 11), unchanged by this. */
export interface CookingTimer {
	stepId: string;
	endsAt: string; // ISO
	totalMinutes: number;
}

export interface CookingSessionPlanContext {
	planId: string;
	date: string;
	mealId: string;
}

export interface CookingSession {
	recipeId: string;
	recipeName: string;
	startedAt: string;
	updatedAt: string;
	/** Where the cook actually is right now. */
	stepIndex: number;
	/** Denormalized so a resume banner can render "3/5" without loading the recipe. */
	stepCount: number;
	/** Step ids genuinely finished — not derivable from `stepIndex` alone, since tapping back to
	 *  re-read step 2 mustn't un-finish steps 3 and 4. */
	doneStepIds: string[];
	/** ingredientId -> what was used instead. */
	substitutions: Record<string, CookingSubstitutionChoice>;
	timer?: CookingTimer;
	/** Set only when the session was started from a meal on /plan — that's what lets finishing the
	 *  cook mark that specific planned meal as cooked. Deliberately carried in the session rather
	 *  than in the URL: /recipes/[id]/cook is prerendered in the Capacitor build (it has an
	 *  `entries` generator), and a prerendered page can't read `page.url.searchParams` — the exact
	 *  restriction /plan, /shopping-list and /login each had to opt out of prerendering for. Putting
	 *  it in the session avoids that entirely AND survives a return visit with no query string. */
	planContext?: CookingSessionPlanContext;
	finishedAt?: string;
}

/** One row's worth of "spend this much of this pantry item" — resolved in the PANTRY ROW's own
 *  unit, not the recipe's, because that's the number that actually has to be subtracted. */
export interface PantryDeduction {
	pantryItemId: string;
	ingredientName: string;
	/** In `unit` — the pantry row's own unit, already converted from the recipe's. */
	quantity: number;
	unit: string;
}

/** What a recipe's ingredient could NOT be fully taken out of the pantry for. Two genuinely
 *  different answers, kept apart for the same reason `pantryStatus.ts` keeps them apart: "you
 *  didn't have enough" and "I can't tell how much you had" are different facts, and merging them
 *  into one generic warning would make both untrustworthy. */
export interface CookingShortfall {
	ingredientName: string;
	/** How much of the recipe's own unit couldn't be covered. 0 for a purely `unresolved` row. */
	missingQuantity: number;
	unit: string;
	reason: 'short' | 'unresolved';
}

export interface CookingDeductionPlan {
	deductions: PantryDeduction[];
	shortfalls: CookingShortfall[];
}
