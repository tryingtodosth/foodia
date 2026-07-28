// Device/Equipment Alternatives (CLAUDE.md 4.1/4.2) — the step-level mirror of substitution.ts.
// Pure, framework-agnostic functions except `missingEquipmentLabel` (which reads `t()` directly,
// the same small, deliberate exception `hardware.ts`'s own `equipmentMatchLabel` already takes —
// see that function's own doc comment for why reading a reactive store from a plain util is fine).
import type { HardwareProfile } from '$lib/types/user';
import type { Step, StepAlternative } from '$lib/types/recipe';
import { ownsRequiredEquipment } from './hardware';
import { t } from '$lib/i18n/t';
import type { MessageKey } from '$lib/i18n/messages';

/** True when the viewer's own kitchen can't run the step's base technique as written. */
export function stepNeedsAlternative(step: Step, hardware: HardwareProfile | null): boolean {
	return !ownsRequiredEquipment(step.requiresEquipment ?? [], hardware);
}

/**
 * A human-readable "X, Y" list of which of `required`'s equipment the viewer doesn't own — the
 * "missing" mirror of `hardware.ts`'s own "matching" `equipmentMatchLabel`, reusing the same
 * `hardware.*` translated-noun-form dictionary keys (genitive Polish forms meant to slot into a
 * sentence) rather than the checkbox-label `onboarding.hardware.*` keys the propose form uses.
 * Returns `null` when nothing is actually missing (a null/absent hardware profile — Progressive
 * Profiling's Neutral default — never has anything "missing", same as `ownsRequiredEquipment`).
 */
export function missingEquipmentLabel(
	required: string[],
	owned: HardwareProfile | null
): string | null {
	if (!owned || required.length === 0) return null;
	const missing = required.filter((key) => owned[key as keyof HardwareProfile] !== true);
	if (missing.length === 0) return null;
	return missing.map((key) => t(`hardware.${key}` as MessageKey)).join(` ${t('common.and')} `);
}

/** Same "sort by net reaction score" discipline sortSubstitutionsByReaction already establishes. */
export function sortAlternativesByReaction(alts: StepAlternative[]): StepAlternative[] {
	return [...alts].sort((a, b) => {
		const scoreA = (a.reactions?.upCount ?? 0) - (a.reactions?.downCount ?? 0);
		const scoreB = (b.reactions?.upCount ?? 0) - (b.reactions?.downCount ?? 0);
		return scoreB - scoreA;
	});
}

/**
 * The best alternative the viewer can actually cook — highest-reacted among the ones whose OWN
 * equipment need they satisfy (including alternatives needing no special equipment at all) — or
 * `null` if none exist or none fit. This is what Cooking Mode auto-suggests; the recipe detail
 * page's own browse/vote/choose UI shows every alternative regardless of fit, since deciding what
 * you can actually use is exactly the point of browsing there before you start cooking.
 */
export function pickUsableAlternative(
	alts: StepAlternative[],
	hardware: HardwareProfile | null
): StepAlternative | null {
	const usable = alts.filter((a) => ownsRequiredEquipment(a.requiresEquipment ?? [], hardware));
	if (usable.length === 0) return null;
	return sortAlternativesByReaction(usable)[0];
}
