// A real, mock-first account system (Session 8) — deliberately NOT a hard gate on the rest of the
// app. CLAUDE.md 4.1's own "Progressive Profiling" principle has governed this app since P1: it
// has never blocked its front door on a form (skipping onboarding runs a Neutral profile instead
// of a wall), and login shouldn't become the first exception. Authenticating is purely additive —
// it gives `currentUserRef()` (profile.svelte.ts) a real, stable identity for authored comments
// instead of the anonymous 'Ty'/'anon-me' fallback, and lays the groundwork FUTURES.md's own
// family/social-planning ideas need (Section 7, item 21) — but every existing anonymous flow
// (onboarding, pantry, planning) keeps working exactly as it did before this session, untouched.
//
// Cookie-based persistence from the start, not localStorage/sessionStorage — 2do's own Session 34
// already rediscovered the hard way that both are tab-scoped, not origin-scoped, causing a real
// "log in, open a new tab, appear logged out" bug. Applying that lesson proactively here rather
// than waiting to independently rediscover it — reuses this app's own existing
// lib/utils/cookies.ts (built for the Session 6 language switcher, same SSR-guarded shape).
//
// Purely client-side — same as 2do's own AuthGuard, and for the same reason (no real backend to
// validate a token against) plus one more specific to this app: the Capacitor build (Session 6)
// prerenders every page at BUILD time, so nothing authentication-shaped could safely live in a
// server load here even if there were a reason to.
import type { UserRef } from '$lib/types/recipe';
import { AUTH_ACCOUNTS, AUTH_NETWORK_DELAY_MS, type AuthAccount } from '$lib/api/mock/auth.mock';
import { getCookie, setCookie, removeCookie } from '$lib/utils/cookies';

const AUTH_COOKIE = 'foodia-auth-user-id';

let account = $state<UserRef | null>(null);
let isLoading = $state(false);
let hydrated = $state(false);

function delay<T>(value: T): Promise<T> {
	return new Promise((resolve) => setTimeout(() => resolve(value), AUTH_NETWORK_DELAY_MS));
}

export interface AuthResult {
	success: boolean;
	error?: string;
}

export const authStore = {
	get account(): UserRef | null {
		return account;
	},
	get isAuthenticated(): boolean {
		return account !== null;
	},
	get isLoading(): boolean {
		return isLoading;
	},
	get hydrated(): boolean {
		return hydrated;
	},
	/** Client-only, deliberately lazy — same reasoning profile.svelte.ts's own hydrate() documents:
	 *  starting from `null` keeps SSR and the client's pre-hydrate render in agreement, and "not
	 *  logged in yet" IS the correct default either way. Only ever resolves to one of the two SEED
	 *  accounts after a hard reload — a freshly-registered account lives in the same in-memory
	 *  `AUTH_ACCOUNTS` array, which resets on every full page load; see auth.mock.ts's own note. */
	hydrate(): void {
		if (hydrated) return;
		const userId = getCookie(AUTH_COOKIE);
		if (userId) {
			const found = AUTH_ACCOUNTS.find((a) => a.user.id === userId);
			if (found) account = found.user;
		}
		hydrated = true;
	},
	async login(email: string, password: string): Promise<AuthResult> {
		isLoading = true;
		const normalized = email.trim().toLowerCase();
		const match = await delay(
			AUTH_ACCOUNTS.find((a) => a.email.toLowerCase() === normalized && a.password === password)
		);
		isLoading = false;
		if (!match) return { success: false, error: 'invalid' };
		account = match.user;
		setCookie(AUTH_COOKIE, match.user.id, 365);
		return { success: true };
	},
	async register(email: string, password: string, displayName: string): Promise<AuthResult> {
		const normalized = email.trim().toLowerCase();
		const exists = AUTH_ACCOUNTS.some((a) => a.email.toLowerCase() === normalized);
		if (exists) return { success: false, error: 'email-taken' };

		isLoading = true;
		await delay(undefined);
		isLoading = false;

		const newAccount: AuthAccount = {
			email: normalized,
			password,
			user: { id: crypto.randomUUID(), displayName: displayName.trim(), avatarUrl: null }
		};
		AUTH_ACCOUNTS.push(newAccount);
		account = newAccount.user;
		setCookie(AUTH_COOKIE, newAccount.user.id, 365);
		return { success: true };
	},
	/**
	 * Deliberately does NOT reveal whether the email is registered — always resolves `success: true`
	 * with the same generic message, regardless. A considered difference from 2do's own analogous
	 * form, which deliberately DOES reveal this (for a demonstrable, distinguishable error path) and
	 * flags it as a mock-era simplification rather than a recommendation. This app makes the
	 * opposite call on purpose: account-enumeration prevention is simple enough to just do correctly
	 * here rather than trade it away for a demo convenience neither app strictly needs.
	 */
	async recoverPassword(email: string): Promise<AuthResult> {
		isLoading = true;
		await delay(undefined);
		isLoading = false;
		return { success: true };
	},
	logout(): void {
		account = null;
		removeCookie(AUTH_COOKIE);
	}
};
