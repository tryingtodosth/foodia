import { AUTH_ACCOUNTS } from './auth.mock';
import type { UserRef } from '$lib/types/recipe';

/** The Capacitor/mock counterpart to `lib/server/api/getUserProfile.ts` — `AUTH_ACCOUNTS` (piotr,
 *  ania) is the complete, closed set of real identities the mock fixtures ever attribute anything
 *  to, so a lookup against it is exhaustive here, unlike the real D1-backed version which has no
 *  such closed set. */
export function getMockUserProfile(userId: string): UserRef | null {
	return AUTH_ACCOUNTS.find((a) => a.user.id === userId)?.user ?? null;
}
