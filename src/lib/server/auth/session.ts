// Hand-rolled sessions (CLAUDE.md Section 1, Session 16) — `lucia` is deprecated (confirmed
// directly against npm before choosing this path, not assumed from memory), and its own migration
// guide recommends exactly this shape: a random token set as the cookie, only its SHA-256 hash
// ever stored server-side, so a leaked `sessions` row alone can't be replayed. Fixed 30-day expiry,
// no sliding-window renewal — a real, stated simplification for Phase 1, not an oversight.
import { eq, lt } from 'drizzle-orm';
import type { Db } from '../db';
import { sessions, users } from '../db/schema';

export const SESSION_COOKIE = 'foodia-session';
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function toHex(bytes: ArrayBuffer): string {
	return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function generateToken(): string {
	// 32 random bytes, hex-encoded — same "long, unguessable, opaque" shape a real session token
	// needs; hex over base64url purely so it round-trips through a cookie/URL with zero encoding
	// edge cases to think about.
	return toHex(crypto.getRandomValues(new Uint8Array(32)).buffer);
}

async function hashToken(token: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
	return toHex(digest);
}

export interface SessionUser {
	id: string;
	email: string;
	displayName: string;
	avatarUrl: string | null;
	isModerator: boolean;
}

/** Creates a session row and returns the RAW token — the only time the raw value ever exists;
 *  everything stored from here on is its hash. */
export async function createSession(db: Db, userId: string): Promise<string> {
	const token = generateToken();
	await db.insert(sessions).values({
		id: await hashToken(token),
		userId,
		expiresAt: Date.now() + SESSION_DURATION_MS
	});
	return token;
}

/** Validates a raw token against the stored hash, opportunistically sweeping expired sessions
 *  (cheap, no separate cron needed at this scale) rather than leaving them to accumulate forever. */
export async function validateSession(db: Db, token: string | undefined): Promise<SessionUser | null> {
	if (!token) return null;
	const hashed = await hashToken(token);
	const now = Date.now();

	// Best-effort cleanup, not load-bearing for correctness below — a failed delete here still
	// leaves the expiry check itself correct.
	db.delete(sessions).where(lt(sessions.expiresAt, now)).catch(() => {});

	const [row] = await db
		.select({
			expiresAt: sessions.expiresAt,
			id: users.id,
			email: users.email,
			displayName: users.displayName,
			avatarUrl: users.avatarUrl,
			isModerator: users.isModerator
		})
		.from(sessions)
		.innerJoin(users, eq(users.id, sessions.userId))
		.where(eq(sessions.id, hashed));

	if (!row || row.expiresAt < now) return null;
	const { expiresAt, ...user } = row;
	return user;
}

export async function invalidateSession(db: Db, token: string | undefined): Promise<void> {
	if (!token) return;
	await db.delete(sessions).where(eq(sessions.id, await hashToken(token)));
}
