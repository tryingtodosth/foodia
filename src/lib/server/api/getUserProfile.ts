import type { Db } from '../db';
import * as schema from '../db/schema';
import { eq } from 'drizzle-orm';
import type { UserRef } from '$lib/types/recipe';

/** Real lookup for FUTURES.md 9.1's "Modular Profile" — deliberately not folded into
 *  `RecipeApiClient` (Section 5's interface for the Recipe Graph specifically): "who is this user"
 *  is its own small concern, same reasoning `createComment.ts`/auth's own module already establish
 *  for not routing everything through one interface. A minimal, real slice of 9.1's design, not the
 *  full opt-in-module system — just the one module that ships on by default there (Recipes),
 *  reachable now because every author/comment/proposer name in this app is finally clickable
 *  (Session 22) and needs somewhere real to land. */
export async function getUserProfile(db: Db, userId: string): Promise<UserRef | null> {
	const [row] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
	if (!row) return null;
	return {
		id: row.id,
		displayName: row.displayName,
		avatarUrl: row.avatarUrl,
		isModerator: row.isModerator || undefined
	};
}
