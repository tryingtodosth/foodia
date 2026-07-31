// The admin dashboard's own read/write queries (Session 26). Server-only, like everything else
// under lib/server/. Nothing here does its own permission check on purpose — the single gate is
// /admin/+layout.server.ts for pages and each /api/admin route's own `locals.isAdmin` check for
// mutations, so there's exactly one place per entry point to get right rather than a check
// scattered across a dozen query helpers that could each drift.
import { count, desc, eq, sql } from 'drizzle-orm';
import type { Db } from '../db';
import * as schema from '../db/schema';

export interface AdminStats {
	users: number;
	uploaders: number;
	moderators: number;
	recipes: number;
	ingredients: number;
	steps: number;
	publicComments: number;
	privateComments: number;
	removedComments: number;
	substitutions: number;
	stepAlternatives: number;
	translations: number;
	sessions: number;
	pendingReports: number;
}

/** One `SELECT count(*)` per table rather than a single hand-written UNION: D1 charges by rows
 *  read, and a count over an index reads none of the rows themselves, so this is cheap even as the
 *  corpus grows. They're issued together with Promise.all — the same "one round of parallel
 *  queries, not a serial waterfall" shape `assembleAllRecipeDetails` already needed after Session
 *  21's own N+1 incident. */
export async function loadStats(db: Db): Promise<AdminStats> {
	const one = async (query: Promise<{ value: number }[]>) => (await query)[0]?.value ?? 0;

	const [
		users,
		uploaders,
		moderators,
		recipes,
		ingredients,
		steps,
		publicComments,
		privateComments,
		removedComments,
		substitutions,
		stepAlternatives,
		translations,
		sessions,
		pendingReports
	] = await Promise.all([
		one(db.select({ value: count() }).from(schema.users)),
		one(db.select({ value: count() }).from(schema.users).where(eq(schema.users.canUpload, true))),
		one(db.select({ value: count() }).from(schema.users).where(eq(schema.users.isModerator, true))),
		one(db.select({ value: count() }).from(schema.recipes)),
		one(db.select({ value: count() }).from(schema.ingredients)),
		one(db.select({ value: count() }).from(schema.steps)),
		one(
			db
				.select({ value: count() })
				.from(schema.comments)
				.where(sql`${schema.comments.visibility} = 'public' AND ${schema.comments.removedAt} IS NULL`)
		),
		one(
			db
				.select({ value: count() })
				.from(schema.comments)
				.where(eq(schema.comments.visibility, 'private'))
		),
		one(
			db
				.select({ value: count() })
				.from(schema.comments)
				.where(sql`${schema.comments.removedAt} IS NOT NULL`)
		),
		one(db.select({ value: count() }).from(schema.substitutions)),
		one(db.select({ value: count() }).from(schema.stepAlternatives)),
		one(db.select({ value: count() }).from(schema.translations)),
		one(db.select({ value: count() }).from(schema.sessions)),
		one(
			db
				.select({ value: count() })
				.from(schema.commentReports)
				.where(eq(schema.commentReports.status, 'pending'))
		)
	]);

	return {
		users,
		uploaders,
		moderators,
		recipes,
		ingredients,
		steps,
		publicComments,
		privateComments,
		removedComments,
		substitutions,
		stepAlternatives,
		translations,
		sessions,
		pendingReports
	};
}

export interface AdminUserRow {
	id: string;
	email: string;
	displayName: string;
	isModerator: boolean;
	canUpload: boolean;
	createdAt: string;
	recipeCount: number;
	commentCount: number;
}

/** Every account, with the two counts that make a row meaningful ("is this a real contributor or
 *  a drive-by signup?"). Two grouped queries plus one table scan, joined in memory — the same
 *  "load each table once, group in memory" shape Session 21's N+1 fix established, rather than a
 *  correlated subquery per user. */
export async function loadUsers(db: Db): Promise<AdminUserRow[]> {
	const [userRows, recipeCounts, commentCounts] = await Promise.all([
		db.select().from(schema.users).orderBy(desc(schema.users.createdAt)),
		db
			.select({ id: schema.recipes.authorId, value: count() })
			.from(schema.recipes)
			.groupBy(schema.recipes.authorId),
		db
			.select({ id: schema.comments.authorId, value: count() })
			.from(schema.comments)
			.groupBy(schema.comments.authorId)
	]);

	const recipesByUser = new Map(recipeCounts.map((r) => [r.id, r.value]));
	const commentsByUser = new Map(commentCounts.map((r) => [r.id, r.value]));

	return userRows.map((u) => ({
		id: u.id,
		email: u.email,
		displayName: u.displayName,
		isModerator: u.isModerator,
		canUpload: u.canUpload,
		createdAt: u.createdAt,
		recipeCount: recipesByUser.get(u.id) ?? 0,
		commentCount: commentsByUser.get(u.id) ?? 0
	}));
}

export interface AdminRecipeRow {
	id: string;
	name: string;
	authorId: string;
	authorName: string;
	sourceLocale: string;
	createdAt: string;
	ingredientCount: number;
	stepCount: number;
	commentCount: number;
}

export async function loadRecipes(db: Db): Promise<AdminRecipeRow[]> {
	const [recipeRows, userRows, ingredientCounts, stepCounts, commentCounts] = await Promise.all([
		db.select().from(schema.recipes).orderBy(desc(schema.recipes.createdAt)),
		db.select({ id: schema.users.id, name: schema.users.displayName }).from(schema.users),
		db
			.select({ id: schema.ingredients.recipeId, value: count() })
			.from(schema.ingredients)
			.groupBy(schema.ingredients.recipeId),
		db
			.select({ id: schema.steps.recipeId, value: count() })
			.from(schema.steps)
			.groupBy(schema.steps.recipeId),
		db
			.select({ id: schema.comments.recipeId, value: count() })
			.from(schema.comments)
			.groupBy(schema.comments.recipeId)
	]);

	const names = new Map(userRows.map((u) => [u.id, u.name]));
	const ing = new Map(ingredientCounts.map((r) => [r.id, r.value]));
	const st = new Map(stepCounts.map((r) => [r.id, r.value]));
	const cm = new Map(commentCounts.map((r) => [r.id, r.value]));

	return recipeRows.map((r) => ({
		id: r.id,
		name: r.name,
		authorId: r.authorId,
		authorName: names.get(r.authorId) ?? '—',
		sourceLocale: r.sourceLocale ?? 'pl',
		createdAt: r.createdAt,
		ingredientCount: ing.get(r.id) ?? 0,
		stepCount: st.get(r.id) ?? 0,
		commentCount: cm.get(r.id) ?? 0
	}));
}

export interface AdminCommentRow {
	id: string;
	recipeId: string;
	recipeName: string;
	content: string;
	visibility: 'public' | 'private';
	authorId: string;
	authorName: string;
	createdAt: string;
	removed: boolean;
}

/** Deliberately capped rather than "every comment": this is a review surface, not an export, and
 *  the newest few hundred is what a moderator actually acts on. A real search/pagination pass
 *  belongs here the day the corpus makes this feel small — flagged, not pretended away.
 *
 *  Private comments ARE included, unlike every other read path in this app (which filters them out
 *  — see dbApiClient's own note on the Session 20 leak). That's the one genuine exception, and a
 *  considered one: moderation is not possible without seeing what's being moderated, and this
 *  route is reachable by exactly the ADMIN_EMAILS allowlist. The UI labels them as private so it's
 *  never ambiguous what's being looked at. */
export async function loadRecentComments(db: Db, limit = 200): Promise<AdminCommentRow[]> {
	const [commentRows, userRows, recipeRows] = await Promise.all([
		db.select().from(schema.comments).orderBy(desc(schema.comments.createdAt)).limit(limit),
		db.select({ id: schema.users.id, name: schema.users.displayName }).from(schema.users),
		db.select({ id: schema.recipes.id, name: schema.recipes.name }).from(schema.recipes)
	]);

	const names = new Map(userRows.map((u) => [u.id, u.name]));
	const recipeNames = new Map(recipeRows.map((r) => [r.id, r.name]));

	return commentRows.map((c) => ({
		id: c.id,
		recipeId: c.recipeId,
		recipeName: recipeNames.get(c.recipeId) ?? '—',
		content: c.content,
		visibility: c.visibility,
		authorId: c.authorId,
		authorName: names.get(c.authorId) ?? '—',
		createdAt: c.createdAt,
		removed: c.removedAt !== null
	}));
}

export async function setUserFlag(
	db: Db,
	userId: string,
	flag: 'isModerator' | 'canUpload',
	value: boolean
): Promise<void> {
	await db
		.update(schema.users)
		.set(flag === 'isModerator' ? { isModerator: value } : { canUpload: value })
		.where(eq(schema.users.id, userId));
}

/** Deletes the account row only. Their recipes and comments stay, deliberately: those rows are
 *  referenced by other people's meal plans, threads and reports, and cascading them would quietly
 *  delete a large amount of other users' context along with one account. Sessions go (a deleted
 *  account must not stay logged in anywhere); the FK on `sessions.user_id` already cascades, but
 *  it's done explicitly here so the intent doesn't depend on a schema detail. */
export async function deleteUser(db: Db, userId: string): Promise<void> {
	await db.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
	await db.delete(schema.users).where(eq(schema.users.id, userId));
}

/** A hard delete, unlike a moderator's own comment removal (which is a reversible tombstone).
 *  Ingredients/steps/comments/versions/translations all cascade from the recipe row per the
 *  schema's own `onDelete: 'cascade'` — substitutions and step alternatives cascade in turn from
 *  their ingredient/step parents. */
export async function deleteRecipe(db: Db, recipeId: string): Promise<void> {
	await db.delete(schema.recipes).where(eq(schema.recipes.id, recipeId));
}

export async function deleteComment(db: Db, commentId: string): Promise<void> {
	await db.delete(schema.comments).where(eq(schema.comments.id, commentId));
}

/** The admin-side counterpart of a moderator's report resolution: hide or restore a comment
 *  directly, without a report having been filed. `restore` is the piece /moderation has never had
 *  — a removal there was one-way. */
export async function setCommentRemoved(
	db: Db,
	commentId: string,
	removed: boolean,
	adminId: string
): Promise<void> {
	await db
		.update(schema.comments)
		.set(
			removed
				? { removedAt: new Date().toISOString(), removedById: adminId }
				: { removedAt: null, removedById: null }
		)
		.where(eq(schema.comments.id, commentId));
}
