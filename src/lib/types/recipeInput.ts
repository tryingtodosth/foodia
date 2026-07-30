// The write-side counterpart to RecipeCard/RecipeDetail (CLAUDE.md 4.2's own long-flagged "no way
// to create a recipe at all" gap, closed for real — Session 18) — deliberately a SEPARATE, smaller
// shape from RecipeDetail itself, not that type with everything optional. A creator never supplies
// an id (server-generated), an author (the logged-in session decides that), reactions, or
// timestamps — modeling the input as its own type makes "what the composer actually collects" and
// "what a recipe fully is" two honest, separate contracts instead of one type doing both jobs.
//
// `ingredientIndexes` on a step (not `ingredientIds`) is the one real structural difference from
// `Step` itself: the composer's ingredients don't have real ids yet at submit time (those are
// generated server-side, in insertion order), so a step references an ingredient by its position
// in the `ingredients` array instead — the server resolves indexes to real ids during the same
// insert transaction that creates the ingredients.
export interface CreateRecipeIngredientInput {
	name: string;
	quantity: number;
	unit: string;
}

export interface CreateRecipeStepInput {
	text: string;
	durationMinutes?: number;
	requiresEquipment?: string[];
	ingredientIndexes: number[];
}

export interface CreateRecipeInput {
	name: string;
	summary: string;
	description: string;
	heroImage: string;
	tags: string[];
	dietFlags: string[];
	requiredEquipment: string[];
	timeMinutes: number;
	costEstimate?: { amount: number; currency: string };
	macros: { kcal: number; proteinG: number; fatG: number; carbsG: number };
	ingredients: CreateRecipeIngredientInput[];
	steps: CreateRecipeStepInput[];
	/** Session 24 — the language this recipe is actually authored in. Optional, defaults to `'pl'`
	 *  server-side (see `createRecipe.ts`): every recipe this app has ever created through this
	 *  endpoint before now genuinely was Polish, so an absent value staying Polish is the honest
	 *  default, not an arbitrary one. The Composer UI doesn't expose this yet (a real, stated gap —
	 *  it has no language picker), so it only ever sends the default; real English content this
	 *  session imports directly against the API sets it explicitly. */
	sourceLocale?: string;
}
