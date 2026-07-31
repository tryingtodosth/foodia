// Who counts as an admin (Session 26). Deliberately an ENVIRONMENT allowlist, not a database
// column — the one difference that actually matters here:
//
//   `users.is_moderator` and `users.can_upload` are rows this app's own code writes, so any bug
//   in an admin endpoint, any SQL injection, any future "grant yourself X" path is, in principle,
//   a way to become one. `ADMIN_EMAILS` lives in the Worker's environment (a Cloudflare secret in
//   production, `.dev.vars` locally) and there is no code path anywhere in this repo that writes
//   it. Getting admin requires access to the Cloudflare account, not access to the app.
//
// Matching is on the account's email, so being on the list is still not enough on its own — you
// also have to log in as that account (real session, real PBKDF2 password check). The list is the
// second factor of authorization, never the first factor of authentication.
import type { SessionUser } from './session';

/** Parses the comma-separated `ADMIN_EMAILS` binding. Absent/blank is an EMPTY list, never a
 *  wildcard — a misconfigured deploy must lock the admin out, not let everyone in. */
export function adminEmails(platform: App.Platform | undefined): string[] {
	const raw = platform?.env?.ADMIN_EMAILS;
	if (typeof raw !== 'string') return [];
	return raw
		.split(',')
		.map((entry) => entry.trim().toLowerCase())
		.filter((entry) => entry.length > 0);
}

/** Case-insensitive, same normalization `register`/`login` already apply to every stored email
 *  (lib/server/auth/index.ts), so a list entry can't silently miss on casing alone. */
export function isAdminUser(
	user: SessionUser | null | undefined,
	platform: App.Platform | undefined
): boolean {
	if (!user?.email) return false;
	return adminEmails(platform).includes(user.email.trim().toLowerCase());
}
