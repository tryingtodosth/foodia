// Hardware as a hard filter, per CLAUDE.md 4.1: "hide a recipe requiring an airfryer if none is
// declared." A missing profile (Progressive Profiling's Neutral default) means no filter at all —
// `owned: null` always passes.
import type { HardwareProfile } from '$lib/types/user';
import { t } from '$lib/i18n/t';
import type { MessageKey } from '$lib/i18n/messages';

export function ownsRequiredEquipment(required: string[], owned: HardwareProfile | null): boolean {
	if (!owned) return true;
	return required.every((key) => owned[key as keyof HardwareProfile] === true);
}

/**
 * The "Idealne do Twojego Airfryera" AHA-moment tag from CLAUDE.md Section 2's onboarding sketch
 * — only shown once a recipe genuinely needs equipment the user has actually declared owning.
 * Reads `t()` directly (a deliberate, small exception to this file's own "pure util" shape,
 * same category 2do's own permissions.ts documents for reading a reactive store from a plain
 * function) so the badge text updates instantly when the interface language changes.
 */
export function equipmentMatchLabel(required: string[], owned: HardwareProfile | null): string | null {
	if (!owned || required.length === 0) return null;
	if (!ownsRequiredEquipment(required, owned)) return null;
	const names = required.map((key) => t(`hardware.${key}` as MessageKey));
	return t('hardware.equipmentMatch', { equipment: names.join(` ${t('common.and')} `) });
}
