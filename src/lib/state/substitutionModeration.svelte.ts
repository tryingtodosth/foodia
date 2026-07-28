// Substitution "recognized" graduation (CLAUDE.md 4.4/6.4) — this app's 8th `.svelte.ts` rune
// store. Crossing the reaction threshold (`substitution.ts`'s `isEligibleForRecognition`) only
// ever makes a community substitution ELIGIBLE for the "recognized" badge — actually promoting it
// still needs an explicit moderator action here, the same "explicit approval, not a silent
// vote-count auto-promotion" call `2do`'s own Session 30 "Spawn & Link" pattern already makes for
// its own analogous graduation. Session-only, same honesty every rune store in this app carries.
let recognizedIds = $state<string[]>([]);

export const substitutionModerationStore = {
	get all(): string[] {
		return recognizedIds;
	},
	isRecognized(substitutionId: string): boolean {
		return recognizedIds.includes(substitutionId);
	},
	markRecognized(substitutionId: string): void {
		if (!recognizedIds.includes(substitutionId)) {
			recognizedIds = [...recognizedIds, substitutionId];
		}
	},
	unmark(substitutionId: string): void {
		recognizedIds = recognizedIds.filter((id) => id !== substitutionId);
	}
};
