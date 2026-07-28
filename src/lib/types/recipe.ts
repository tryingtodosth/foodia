// The Recipe Graph Engine — see CLAUDE.md Section 3.
// A recipe is a graph (Ingredient/Step/Substitution nodes), not a text document.

export type NodeType = 'ingredient' | 'step' | 'substitution' | 'step_alternative';

export interface UserRef {
	id: string;
	displayName: string;
	avatarUrl: string | null;
	/** Session 13 — the one flag this app's moderation queue (`/moderation`) gates on, same
	 *  minimal-flag shape `2do`'s own `isNodeSuperadmin` uses for an analogous "who's allowed to
	 *  act here" question. Absent/false for every account except the one fixture designated a
	 *  moderator (`piotr`, recipes.mock.ts) — there's no admin UI to grant/revoke this, same
	 *  honesty every other mock-era role flag in this codebase already carries. */
	isModerator?: boolean;
}

export interface MacroSummary {
	kcal: number;
	proteinG: number;
	fatG: number;
	carbsG: number;
}

export interface ReactionSummary {
	upCount: number;
	downCount: number;
	currentUserReaction: 'up' | 'down' | null;
}

export interface Substitution {
	id: string;
	forIngredientId: string;
	name: string;
	ratio: number; // multiplier applied to the original ingredient's quantity
	deltaMacros?: Partial<MacroSummary>; // delta applied to the whole recipe if this is chosen
	reactions?: ReactionSummary;
	source: 'system' | 'community';
	proposedBy?: UserRef;
}

export interface Ingredient {
	id: string;
	name: string;
	quantity: number;
	unit: string;
	substitutable: boolean;
	substitutions?: Substitution[];
}

/**
 * Device/Equipment Alternatives (CLAUDE.md 4.1/4.2's own long-flagged "temporarily disable broken
 * equipment... needs a real per-recipe re-derivation of alternate cooking methods" gap) — the
 * step-level mirror of `Substitution`'s ingredient-level shape: a `Step` that needs equipment the
 * cook doesn't have can offer zero-or-more alternate techniques, each community-votable, each
 * naming what equipment *it* needs instead (absent/empty means no special equipment needed at
 * all — a stovetop/hand technique). Same "system vs community" source split as `Substitution`.
 */
export interface StepAlternative {
	id: string;
	forStepId: string;
	text: string;
	requiresEquipment?: string[]; // HardwareProfile keys this alternate technique needs instead
	durationMinutes?: number; // the alternate technique may take a different amount of time
	reactions?: ReactionSummary;
	source: 'system' | 'community';
	proposedBy?: UserRef;
}

export interface Step {
	id: string;
	order: number;
	text: string;
	durationMinutes?: number; // presence renders a tappable Timer chip in Cooking Mode
	requiresEquipment?: string[]; // HardwareProfile keys
	ingredientIds: string[];
	alternatives?: StepAlternative[];
}

export interface RecipeVersion {
	id: string;
	label: string;
	parentRecipeId: string | null;
}

export interface NodeComment {
	id: string;
	target: { type: NodeType; id: string };
	content: string;
	visibility: 'public' | 'private';
	author: UserRef;
	reactions?: ReactionSummary;
	createdAt: string;
}

export interface RecipeRelationship {
	id: string;
	from: { type: 'recipe' | NodeType; id: string };
	to: { type: 'recipe' | NodeType; id: string; label: string };
	relationshipType: string; // 'is_alternative_to' | 'evolved_from' | 'base_of' | ...
	source: 'system' | 'community';
}

/** Everything a feed/grid needs. Nothing that requires a second query. */
export interface RecipeCard {
	id: string;
	name: string;
	summary: string;
	heroImage: string;
	author: UserRef;
	tags: string[];
	dietFlags: string[];
	requiredEquipment: string[];
	timeMinutes: number;
	costEstimate?: { amount: number; currency: string };
	macros: MacroSummary;
	reactions?: ReactionSummary;
	createdAt: string;
	updatedAt: string;
	/**
	 * The language this recipe's own `name`/`summary`/`description` were actually authored in.
	 * Absent means `'pl'` — every mock fixture today is Polish-authored, matching this app's own
	 * target-market default (CLAUDE.md 8B). Deliberately a bare locale-code string, not the
	 * interface's own closed `UiLocale` union (lib/i18n/locales.ts) — a recipe can be authored (or
	 * translated into) a language the interface shell doesn't support yet; these are two
	 * independent vocabularies, not one shared enum, same split 2do's own CLAUDE.md documents for
	 * exactly this reason.
	 */
	sourceLocale?: string;
}

/** The three fields community members can translate or suggest a revision for — deliberately not
 *  ingredient names or step text in this pass; see CLAUDE.md's own translation section for why
 *  that's a flagged, honest scope cut rather than an oversight. */
export type TranslatableField = 'name' | 'summary' | 'description';

/**
 * A community-submitted translation OR a same-language "improve the original" suggestion — the
 * same mechanism covers both, distinguished only by whether `locale` matches the recipe's own
 * `sourceLocale`. Genuinely NOT Content/a first-class page of its own (mirrors 2do's own
 * `Translation` type, which explicitly isn't Content either) — it's data attached to one Recipe,
 * with no comment thread or permissions of its own.
 */
export interface Translation {
	id: string;
	recipeId: string;
	locale: string; // see RecipeCard.sourceLocale's own note — not constrained to UiLocale
	fields: Partial<Record<TranslatableField, string>>; // only whichever fields were actually changed
	translatedBy: UserRef;
	reactions?: ReactionSummary; // lets the community vote among competing submissions for the same locale
	createdAt: string;
}

/** Card fields plus the full graph: ingredients, steps, versions, comments, relationships. */
export interface RecipeDetail extends RecipeCard {
	description: string;
	ingredients: Ingredient[];
	steps: Step[];
	versions?: RecipeVersion[];
	comments?: NodeComment[];
	relationships?: RecipeRelationship[];
	/** Detail-only, same weight-split reasoning as `comments`/`relationships` — a feed card never
	 *  needs the full competing-translations history, only the Detail view resolving what to show does. */
	translations?: Translation[];
}
