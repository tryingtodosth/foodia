// A real account system — mock-first for the Capacitor build (which can never have a live server
// to call, by definition, see lib/server/api/client.ts's own header comment), genuinely D1-backed
// for the default build (Session 16, CLAUDE.md Section 1). Same exposed interface either way — no
// other file in this app (UserAvatarMenu, LoginForm/RegisterForm/PasswordResetForm, /moderation's
// canModerate check, currentUserRef(), /activity) needed to change for this swap, exactly the "one
// interface, swappable implementation" promise Section 5 makes for the recipe API and now keeps
// for auth too.
//
// The real session token itself is httpOnly (set by the server's own Set-Cookie header on
// /api/auth/login|register, cleared by /api/auth/logout) — this file never reads or writes it
// directly, only the browser does, which is the whole point (an XSS bug can't steal a token this
// client-side code never has access to). `lib/utils/cookies.ts`'s document.cookie helpers are only
// still used for the Capacitor/mock path below, which never had a real token to protect in the
// first place.
import type { UserRef } from '$lib/types/recipe';
import { AUTH_ACCOUNTS, AUTH_NETWORK_DELAY_MS, type AuthAccount } from '$lib/api/mock/auth.mock';
import { getCookie, setCookie, removeCookie } from '$lib/utils/cookies';

const MOCK_AUTH_COOKIE = 'foodia-auth-user-id';

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

async function postJson(url: string, body: unknown): Promise<{ status: number; data: any }> {
	const res = await fetch(url, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
	return { status: res.status, data: await res.json().catch(() => ({})) };
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
	 *  starting from `null` keeps SSR and the client's pre-hydrate render in agreement. Fire-and-
	 *  forget by design (the root layout's own $effect calls this alongside three synchronous
	 *  hydrate()s and never awaits any of them) — `account`/`hydrated` update reactively once the
	 *  real check resolves, same UX shape as the old synchronous mock version just genuinely async
	 *  now that it's a real network round-trip instead of an in-memory array lookup. */
	hydrate(): void {
		if (hydrated) return;
		if (__IS_CAPACITOR__) {
			const userId = getCookie(MOCK_AUTH_COOKIE);
			if (userId) {
				const found = AUTH_ACCOUNTS.find((a) => a.user.id === userId);
				if (found) account = found.user;
			}
			hydrated = true;
			return;
		}
		fetch('/api/auth/me')
			.then((res) => res.json())
			.then((data) => {
				account = data.user ?? null;
			})
			.catch(() => {
				account = null;
			})
			.finally(() => {
				hydrated = true;
			});
	},
	async login(email: string, password: string): Promise<AuthResult> {
		if (__IS_CAPACITOR__) {
			isLoading = true;
			const normalized = email.trim().toLowerCase();
			const match = await delay(
				AUTH_ACCOUNTS.find((a) => a.email.toLowerCase() === normalized && a.password === password)
			);
			isLoading = false;
			if (!match) return { success: false, error: 'invalid' };
			account = match.user;
			setCookie(MOCK_AUTH_COOKIE, match.user.id, 365);
			return { success: true };
		}

		isLoading = true;
		const { status, data } = await postJson('/api/auth/login', { email, password });
		isLoading = false;
		if (status !== 200 || !data.success) return { success: false, error: data.error ?? 'invalid' };
		account = data.user;
		return { success: true };
	},
	async register(email: string, password: string, displayName: string): Promise<AuthResult> {
		if (__IS_CAPACITOR__) {
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
			setCookie(MOCK_AUTH_COOKIE, newAccount.user.id, 365);
			return { success: true };
		}

		isLoading = true;
		const { status, data } = await postJson('/api/auth/register', { email, password, displayName });
		isLoading = false;
		if (status !== 201 || !data.success) return { success: false, error: data.error ?? 'email-taken' };
		account = data.user;
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
		if (__IS_CAPACITOR__) {
			await delay(undefined);
		} else {
			await postJson('/api/auth/password-reset', { email });
		}
		isLoading = false;
		return { success: true };
	},
	async logout(): Promise<void> {
		account = null;
		if (__IS_CAPACITOR__) {
			removeCookie(MOCK_AUTH_COOKIE);
			return;
		}
		await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
	}
};
