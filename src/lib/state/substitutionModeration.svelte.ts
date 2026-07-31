// Substitution "recognized" graduation (CLAUDE.md 4.4/6.4) — this app's 8th `.svelte.ts` rune
// store. Crossing the reaction threshold (`substitution.ts`'s `isEligibleForRecognition`) only
// ever makes a community substitution ELIGIBLE for the "recognized" badge — actually promoting it
// still needs an explicit moderator action here, the same "explicit approval, not a silent
// vote-count auto-promotion" call `2do`'s own Session 30 "Spawn & Link" pattern already makes for
// its own analogous graduation.
//
// Session 26 — backed by the real `recognized_substitutions` D1 table (which has existed since
// Session 17's schema but had nothing reading or writing it) through
// /api/recognized-substitutions, so a badge granted by one moderator is now a badge every visitor
// sees, on every device, after a reload. Same shape as commentModeration.svelte.ts: a client-side
// cache of server truth, with the Capacitor build keeping the original in-memory behavior since it
// has no server to ask.
let recognizedIds = $state<string[]>([]);
let hydrated = $state(false);

export const substitutionModerationStore = {
	get all(): string[] {
		return recognizedIds;
	},
	get hydrated(): boolean {
		return hydrated;
	},
	isRecognized(substitutionId: string): boolean {
		return recognizedIds.includes(substitutionId);
	},
	/** Public data — the badge is shown to every viewer, so this deliberately needs no session and
	 *  doesn't check for one. */
	hydrate(): void {
		if (hydrated) return;
		if (__IS_CAPACITOR__) {
			hydrated = true;
			return;
		}
		fetch('/api/recognized-substitutions')
			.then((res) => res.json())
			.then((data) => {
				recognizedIds = data.ids ?? [];
			})
			.catch(() => {
				recognizedIds = [];
			})
			.finally(() => {
				hydrated = true;
			});
	},
	async markRecognized(substitutionId: string): Promise<{ success: boolean }> {
		if (__IS_CAPACITOR__) {
			if (!recognizedIds.includes(substitutionId)) {
				recognizedIds = [...recognizedIds, substitutionId];
			}
			return { success: true };
		}

		const res = await fetch('/api/recognized-substitutions', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ substitutionId })
		}).catch(() => null);
		if (!res?.ok) return { success: false };
		if (!recognizedIds.includes(substitutionId)) {
			recognizedIds = [...recognizedIds, substitutionId];
		}
		return { success: true };
	},
	async unmark(substitutionId: string): Promise<{ success: boolean }> {
		if (__IS_CAPACITOR__) {
			recognizedIds = recognizedIds.filter((id) => id !== substitutionId);
			return { success: true };
		}

		const res = await fetch(`/api/recognized-substitutions/${substitutionId}`, {
			method: 'DELETE'
		}).catch(() => null);
		if (!res?.ok) return { success: false };
		recognizedIds = recognizedIds.filter((id) => id !== substitutionId);
		return { success: true };
	}
};
