// Reconciles the recipe-level `RecipeCard.requiredEquipment` hard filter (CLAUDE.md 4.1) with the
// step-level Device/Equipment Alternatives system (4.9) — Section 7 item 26's own flagged gap.
// Pure, framework-agnostic (no Svelte import), same discipline hardware.ts/stepAlternative.ts
// already follow.
import type { HardwareProfile } from '$lib/types/user';
import type { RecipeCard, RecipeDetail } from '$lib/types/recipe';
import { ownsRequiredEquipment } from './hardware';
import { stepNeedsAlternative, pickUsableAlternative } from './stepAlternative';

/**
 * True when a recipe is genuinely makeable given the viewer's hardware — not "does the raw,
 * hand-authored `RecipeCard.requiredEquipment` list match," but "does every step either need
 * nothing the viewer lacks, or have at least one `StepAlternative` the viewer CAN actually cook."
 *
 * Deliberately does NOT simply replace the flat `requiredEquipment` check outright — a piece of
 * equipment named at the recipe level but never attributed to any specific step (`overnightOats`'s
 * own `kitchenScale`, which no step declares needing) has no alternative-technique path to check
 * against by definition, so it stays exactly as hard a block as it always was. Only equipment that
 * IS attributable to a step (i.e. some step's own `requiresEquipment` names it) gets the richer,
 * alternative-aware treatment. This is what keeps `airfryerFries` correctly un-hidden for a viewer
 * with an oven (or with neither, since its stovetop-pan alternative needs nothing) while
 * `overnightOats` stays correctly hidden without a kitchen scale, exactly as before.
 *
 * Falls back to the plain flat `requiredEquipment` check when given a bare `RecipeCard` with no
 * `steps` at all — the honest degrade path for any future caller that only has Card-weight data.
 * Every current caller (the home feed, `/plan`'s picker) now loads full `RecipeDetail` specifically
 * so this richer check runs for real, not just in theory.
 */
export function isRecipeCookable(
	recipe: RecipeCard | RecipeDetail,
	hardware: HardwareProfile | null
): boolean {
	if (!('steps' in recipe)) {
		return ownsRequiredEquipment(recipe.requiredEquipment, hardware);
	}

	const stepsOk = recipe.steps.every(
		(step) =>
			!stepNeedsAlternative(step, hardware) ||
			pickUsableAlternative(step.alternatives ?? [], hardware) !== null
	);

	const stepEquipment = new Set(recipe.steps.flatMap((step) => step.requiresEquipment ?? []));
	const recipeOnlyEquipment = recipe.requiredEquipment.filter((e) => !stepEquipment.has(e));
	const recipeOnlyOk = ownsRequiredEquipment(recipeOnlyEquipment, hardware);

	return stepsOk && recipeOnlyOk;
}
