// register()/login() — the D1-backed replacement for auth.mock.ts's own in-memory AUTH_ACCOUNTS
// matching logic, kept behaviorally identical where it matters: case-insensitive email matching,
// and login never revealing *which* part (email vs password) was wrong — same considered call
// auth.svelte.ts's own header comment already documents making differently from 2do's own
// analogous form.
import { eq, sql } from 'drizzle-orm';
import type { Db } from '../db';
import { users } from '../db/schema';
import { hashPassword, verifyPassword } from './password';
import { createSession, type SessionUser } from './session';

export interface AuthOutcome {
	success: boolean;
	error?: 'invalid' | 'email-taken';
	user?: SessionUser;
	sessionToken?: string;
}

export async function register(
	db: Db,
	email: string,
	password: string,
	displayName: string
): Promise<AuthOutcome> {
	const normalizedEmail = email.trim().toLowerCase();
	const [existing] = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(sql`lower(${users.email})`, normalizedEmail));
	if (existing) return { success: false, error: 'email-taken' };

	const id = crypto.randomUUID();
	const passwordHash = await hashPassword(password);
	const trimmedName = displayName.trim();
	await db.insert(users).values({
		id,
		email: normalizedEmail,
		passwordHash,
		displayName: trimmedName,
		avatarUrl: null,
		isModerator: false,
		// Default-off, always — see schema.ts's own note on why an upload permission is never
		// granted at registration time, only explicitly from /admin.
		canUpload: false,
		createdAt: new Date().toISOString()
	});

	const sessionToken = await createSession(db, id);
	return {
		success: true,
		sessionToken,
		user: {
			id,
			email: normalizedEmail,
			displayName: trimmedName,
			avatarUrl: null,
			isModerator: false,
			canUpload: false
		}
	};
}

export async function login(db: Db, email: string, password: string): Promise<AuthOutcome> {
	const normalizedEmail = email.trim().toLowerCase();
	const [row] = await db
		.select()
		.from(users)
		.where(eq(sql`lower(${users.email})`, normalizedEmail));

	// Deliberately the same generic 'invalid' error whether the email doesn't exist or the
	// password is wrong — a real backend now, but the account-enumeration-safety call
	// auth.svelte.ts already made against the mock store carries forward unchanged.
	if (!row) return { success: false, error: 'invalid' };
	const passwordOk = await verifyPassword(password, row.passwordHash);
	if (!passwordOk) return { success: false, error: 'invalid' };

	const sessionToken = await createSession(db, row.id);
	return {
		success: true,
		sessionToken,
		user: {
			id: row.id,
			email: row.email,
			displayName: row.displayName,
			avatarUrl: row.avatarUrl,
			isModerator: row.isModerator,
			canUpload: row.canUpload
		}
	};
}
