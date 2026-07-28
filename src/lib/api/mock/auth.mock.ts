// Mock accounts (Session 8) — reuses the same `piotr`/`ania` identities already authoring recipes
// and comments throughout this app, so logging in as one of them shows a consistent identity
// everywhere, not a disconnected second "account" persona. `password` is plaintext on purpose —
// this is mock-only data with no real backend, the same honesty every other "mock API" in this
// app already carries (never mistake this for a real credential store).
//
// A live, mutable array — `authStore.register()` pushes new accounts onto it. Session-only: this
// is plain module-level state, which resets on every full page reload, so a freshly-registered
// account can log out and log back in for the rest of the current browser session, but does NOT
// survive a hard reload — same honest limitation 2do's own analogous `auth.mock.ts` carries.
import type { UserRef } from '$lib/types/recipe';
import { piotr, ania } from './recipes.mock';

export interface AuthAccount {
	email: string;
	password: string;
	user: UserRef;
}

export const AUTH_ACCOUNTS: AuthAccount[] = [
	{ email: 'piotr@foodia.net', password: 'foodia123', user: piotr },
	{ email: 'ania@foodia.net', password: 'foodia123', user: ania }
];

export const AUTH_NETWORK_DELAY_MS = 400;
