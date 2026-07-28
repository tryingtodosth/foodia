import type { MacroSummary, RecipeDetail, Substitution } from '$lib/types/recipe';

/** Applies a chosen substitution's macro delta on top of the recipe's own base macros. */
export function applySubstitution(base: MacroSummary, sub: Substitution): MacroSummary {
	const delta = sub.deltaMacros ?? {};
	return {
		kcal: base.kcal + (delta.kcal ?? 0),
		proteinG: base.proteinG + (delta.proteinG ?? 0),
		fatG: base.fatG + (delta.fatG ?? 0),
		carbsG: base.carbsG + (delta.carbsG ?? 0)
	};
}

/** Sorts a substitution list the way the community's own upvotes/downvotes decide, per CLAUDE.md 6.4. */
export function sortSubstitutionsByReaction(subs: Substitution[]): Substitution[] {
	return [...subs].sort((a, b) => {
		const scoreA = (a.reactions?.upCount ?? 0) - (a.reactions?.downCount ?? 0);
		const scoreB = (b.reactions?.upCount ?? 0) - (b.reactions?.downCount ?? 0);
		return scoreB - scoreA;
	});
}

/**
 * Default allergen match — a real implementation needs each `Substitution` to carry its own
 * allergen tags (see `filterSafeSubstitutions`'s own note); until then this compares word STEMS
 * (first ~5 letters) rather than whole-word substrings, specifically because Polish declension
 * means the exact word a user types into `DietProfile.allergies` ("orzechy") almost never appears
 * verbatim inside a food name ("orzechowe", "orzech laskowy") even though both obviously name the
 * same allergen. A pure substring match misses that and silently under-filters — a real gap in a
 * guardrail CLAUDE.md 4.1 calls "never an AI suggestion," so this deliberately errs toward
 * over-filtering (hiding a possibly-safe substitution) rather than under-filtering (showing a
 * genuinely unsafe one). Found and fixed during this module's own verification pass, not shipped
 * broken — see lib/api/mock/recipes.mock.ts's own peanut-milk fixture, the concrete case that
 * caught it.
 */
function defaultAllergenNameMatch(subName: string, allergy: string): boolean {
	const stem = allergy.trim().toLowerCase().slice(0, 5);
	if (stem.length < 3) return subName.toLowerCase().includes(stem);
	return subName
		.toLowerCase()
		.split(/[^\p{L}]+/u)
		.some((word) => word.startsWith(stem));
}

/** Filters out any substitution that isn't safe for the given allergies — a hard guardrail,
 *  never an AI suggestion the model is merely asked to respect. See CLAUDE.md 4.1 / Section 7 item 2. */
export function filterSafeSubstitutions(
	subs: Substitution[],
	allergies: string[],
	allergenNameMatch: (subName: string, allergy: string) => boolean = defaultAllergenNameMatch
): Substitution[] {
	if (allergies.length === 0) return subs;
	return subs.filter((sub) => !allergies.some((allergy) => allergenNameMatch(sub.name, allergy)));
}

/**
 * Recomputes a recipe's active macro summary given a set of chosen substitutions
 * (ingredientId -> substitutionId). `extraSubstitutions` are session-proposed ones not yet part of
 * `recipe.ingredients[].substitutions` (the loaded fixture is never mutated) — without this, a
 * freshly-proposed-and-immediately-chosen substitution would be un-findable here and silently fail
 * to affect the macro totals, even though the ingredient list itself already shows it as chosen.
 */
export function recomputeMacros(
	recipe: RecipeDetail,
	chosenSubstitutions: Record<string, string>,
	extraSubstitutions: Substitution[] = []
): MacroSummary {
	let macros = { ...recipe.macros };
	for (const ingredient of recipe.ingredients) {
		const chosenId = chosenSubstitutions[ingredient.id];
		if (!chosenId) continue;
		const sub = [...(ingredient.substitutions ?? []), ...extraSubstitutions].find(
			(s) => s.id === chosenId
		);
		if (sub) macros = applySubstitution(macros, sub);
	}
	return macros;
}
