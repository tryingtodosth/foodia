// The User Context Engine's client-only profile store (CLAUDE.md Section 4.1). No backend exists
// yet, so this is entirely local — localStorage, not even a session cookie. Deliberately hydrated
// lazily via hydrate(), never read synchronously at module load: reading localStorage at module
// scope would make the client's very first render disagree with SSR's (always-null) render the
// instant a returning visitor already has a saved profile — a real hydration mismatch. hydrate()
// is meant to be called once from a client-only $effect (routes/+layout.svelte) — $effect never
// runs during SSR, so both the server render and the client's pre-hydrate render agree on
// `profile: null`, and "no profile yet" IS the correct default anyway (Progressive Profiling,
// Section 4.1 — no profile means the Neutral, unfiltered experience, not a loading state to hide).
import type { UserProfile } from '$lib/types/user';
import type { UserRef } from '$lib/types/recipe';
import { readJSON, writeJSON, removeItem } from '$lib/utils/storage';
import { authStore } from './auth.svelte';

const STORAGE_KEY = 'foodia-profile';

let profile = $state<UserProfile | null>(null);
let hydrated = $state(false);

export const profileStore = {
	get profile(): UserProfile | null {
		return profile;
	},
	get hydrated(): boolean {
		return hydrated;
	},
	get hasOnboarded(): boolean {
		return profile !== null;
	},
	hydrate(): void {
		if (hydrated) return;
		profile = readJSON<UserProfile>(STORAGE_KEY);
		hydrated = true;
	},
	save(next: UserProfile): void {
		profile = next;
		writeJSON(STORAGE_KEY, next);
	},
	clear(): void {
		profile = null;
		removeItem(STORAGE_KEY);
	}
};

/**
 * The one "who's authoring this" identity in the whole app — every session-only comment/reaction
 * this app creates is attributed to whoever this returns. A real authenticated account (Session 8,
 * auth.svelte.ts) always wins when one exists — it's a genuine, stable identity, not a local
 * approximation. Without one, falls back to the pre-Session-8 behavior: the onboarding profile's
 * own id/displayName, or a fixed anonymous-local id if even that's absent (Progressive Profiling —
 * comments/reactions have never required onboarding, let alone a real account, to work).
 */
export function currentUserRef(): UserRef {
	if (authStore.account) return authStore.account;
	return {
		id: profile?.id ?? 'anon-me',
		displayName: profile?.displayName ?? 'Ty',
		avatarUrl: null
	};
}
