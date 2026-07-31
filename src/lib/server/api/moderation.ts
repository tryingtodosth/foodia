// The write/read side of comment moderation against real D1 rows (Session 26). The
// `comment_reports` and `recognized_substitutions` tables have existed since Session 17's schema
// but had no API route touching them at all — /moderation's queues ran entirely off session-only
// client stores, so a report filed on Monday was gone by Tuesday and no moderator on a different
// device ever saw it. This module is what closes that.
//
// Every denormalized field on a report (recipe name, target label, the comment's own text and
// author) is derived HERE, from D1, not accepted from the request body. The client already has
// that context on screen, which is exactly why trusting it would be wrong: a report is evidence,
// and evidence a reporter can rewrite is not evidence. The denormalization itself is unchanged
// from what `CommentReport` has always documented (carry a label, avoid a lookup) — only its
// source of truth moved.
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db';
import * as schema from '../db/schema';
import type { CommentReport, CommentReportReason } from '$lib/types/moderation';
import type { UserRef } from '$lib/types/recipe';

const REASONS: CommentReportReason[] = ['spam', 'abuse', 'unsafe', 'other'];
export function isReportReason(value: unknown): value is CommentReportReason {
	return typeof value === 'string' && REASONS.includes(value as CommentReportReason);
}

export class ModerationError extends Error {
	constructor(
		readonly status: number,
		message: string
	) {
		super(message);
	}
}

async function userRefs(db: Db, ids: string[]): Promise<Map<string, UserRef>> {
	const unique = [...new Set(ids.filter(Boolean))];
	if (unique.length === 0) return new Map();
	const rows = await db.select().from(schema.users).where(inArray(schema.users.id, unique));
	return new Map(
		rows.map((r) => [r.id, { id: r.id, displayName: r.displayName, avatarUrl: r.avatarUrl }])
	);
}

/** A deleted account leaves its reports behind (they're still evidence about a comment), so a ref
 *  that no longer resolves becomes a real placeholder rather than crashing the whole queue. The
 *  placeholder text is a language-neutral dash for the same reason `deriveTargetLabel` returns a
 *  bare name: it's stored/rendered without knowing which interface language will read it. */
function refOr(map: Map<string, UserRef>, id: string): UserRef {
	return map.get(id) ?? { id, displayName: '—', avatarUrl: null };
}

function toReport(
	row: typeof schema.commentReports.$inferSelect,
	refs: Map<string, UserRef>
): CommentReport {
	return {
		id: row.id,
		commentId: row.commentId,
		recipeId: row.recipeId,
		recipeName: row.recipeName,
		targetLabel: row.targetLabel,
		commentContent: row.commentContent,
		commentAuthor: refOr(refs, row.commentAuthorId),
		reason: row.reason,
		reportedBy: refOr(refs, row.reportedById),
		status: row.status,
		createdAt: row.createdAt
	};
}

/** What a comment is attached to, as a short label. Derived from the real ingredient/step row
 *  rather than from a string the reporting client passed along, for the same reason as everything
 *  else here.
 *
 *  Deliberately language-NEUTRAL (an ingredient's own name, "#3" for a step) rather than the
 *  "Składnik: Mąka" phrasing the client-side version produced: this text is denormalized once, at
 *  report time, and then shown to whoever opens the queue later — possibly in the other interface
 *  language. A bare name reads correctly in both; a Polish noun baked into a row would not.
 *
 *  Falls back to a bare '?' when the target row is gone (a cascade delete can outrun a report),
 *  which is still more honest in a queue than an empty cell. */
async function deriveTargetLabel(db: Db, targetType: string, targetId: string): Promise<string> {
	if (targetType === 'ingredient') {
		const [row] = await db
			.select({ name: schema.ingredients.name })
			.from(schema.ingredients)
			.where(eq(schema.ingredients.id, targetId));
		return row?.name ?? '?';
	}
	if (targetType === 'step') {
		const [row] = await db
			.select({ order: schema.steps.orderIndex })
			.from(schema.steps)
			.where(eq(schema.steps.id, targetId));
		return row ? `#${row.order + 1}` : '?';
	}
	if (targetType === 'substitution') {
		const [row] = await db
			.select({ name: schema.substitutions.name })
			.from(schema.substitutions)
			.where(eq(schema.substitutions.id, targetId));
		return row?.name ?? '?';
	}
	const [row] = await db
		.select({ text: schema.stepAlternatives.text })
		.from(schema.stepAlternatives)
		.where(eq(schema.stepAlternatives.id, targetId));
	return row ? row.text.slice(0, 40) : '?';
}

export async function createReport(
	db: Db,
	input: { commentId: string; reason: CommentReportReason; reportedById: string }
): Promise<CommentReport> {
	const [comment] = await db
		.select()
		.from(schema.comments)
		.where(eq(schema.comments.id, input.commentId));
	if (!comment) throw new ModerationError(404, 'That comment does not exist');
	// A private note is only ever visible to its own author, so nobody else is in a position to
	// report one — accepting such a report would mean accepting a claim about content the reporter
	// can't have seen.
	if (comment.visibility !== 'public') throw new ModerationError(403, 'That comment is not public');

	// One live pending report per comment, matching the rule the client store already enforced
	// (and the reason CommentItem disables its own button): a second one is a duplicate queue
	// entry, not new information.
	const [existing] = await db
		.select({ id: schema.commentReports.id })
		.from(schema.commentReports)
		.where(
			and(
				eq(schema.commentReports.commentId, input.commentId),
				eq(schema.commentReports.status, 'pending')
			)
		);
	if (existing) throw new ModerationError(409, 'That comment already has a pending report');

	const [recipe] = await db
		.select({ name: schema.recipes.name })
		.from(schema.recipes)
		.where(eq(schema.recipes.id, comment.recipeId));

	const row: typeof schema.commentReports.$inferInsert = {
		id: crypto.randomUUID(),
		commentId: comment.id,
		recipeId: comment.recipeId,
		recipeName: recipe?.name ?? '—',
		targetLabel: await deriveTargetLabel(db, comment.targetType, comment.targetId),
		commentContent: comment.content,
		commentAuthorId: comment.authorId,
		reason: input.reason,
		reportedById: input.reportedById,
		status: 'pending',
		createdAt: new Date().toISOString()
	};
	await db.insert(schema.commentReports).values(row);

	const refs = await userRefs(db, [row.commentAuthorId, row.reportedById]);
	return toReport({ ...row, status: 'pending' } as typeof schema.commentReports.$inferSelect, refs);
}

/** Every report, newest first — for a moderator/admin queue. */
export async function listAllReports(db: Db): Promise<CommentReport[]> {
	const rows = await db
		.select()
		.from(schema.commentReports)
		.orderBy(desc(schema.commentReports.createdAt));
	const refs = await userRefs(db, rows.flatMap((r) => [r.commentAuthorId, r.reportedById]));
	return rows.map((r) => toReport(r, refs));
}

/** The non-moderator view: reports you filed, plus reports against comments you wrote. Exactly
 *  what /activity's own two sections need (`reportsFiledBy`/`ownCommentsRemoved`) and nothing
 *  else — a visitor has no business seeing the rest of the queue. */
export async function listReportsForUser(db: Db, userId: string): Promise<CommentReport[]> {
	const rows = await db
		.select()
		.from(schema.commentReports)
		.orderBy(desc(schema.commentReports.createdAt));
	const mine = rows.filter((r) => r.reportedById === userId || r.commentAuthorId === userId);
	const refs = await userRefs(db, mine.flatMap((r) => [r.commentAuthorId, r.reportedById]));
	return mine.map((r) => toReport(r, refs));
}

/** Resolving with `'remove'` is what actually hides the comment — filing a report never did and
 *  still doesn't (CLAUDE.md 4.4: content stays visible while under review). The removal is a soft
 *  delete so it stays reversible and so the recipe page can render a tombstone. */
export async function resolveReport(
	db: Db,
	reportId: string,
	action: 'remove' | 'dismiss',
	moderatorId: string
): Promise<CommentReport> {
	const [report] = await db
		.select()
		.from(schema.commentReports)
		.where(eq(schema.commentReports.id, reportId));
	if (!report) throw new ModerationError(404, 'No such report');

	const status = action === 'remove' ? 'removed' : 'dismissed';
	await db
		.update(schema.commentReports)
		.set({ status })
		.where(eq(schema.commentReports.id, reportId));

	if (action === 'remove') {
		await db
			.update(schema.comments)
			.set({ removedAt: new Date().toISOString(), removedById: moderatorId })
			.where(eq(schema.comments.id, report.commentId));
	}

	const refs = await userRefs(db, [report.commentAuthorId, report.reportedById]);
	return toReport({ ...report, status }, refs);
}

export async function listRecognizedSubstitutionIds(db: Db): Promise<string[]> {
	const rows = await db
		.select({ id: schema.recognizedSubstitutions.substitutionId })
		.from(schema.recognizedSubstitutions);
	return rows.map((r) => r.id);
}

export async function markRecognized(db: Db, substitutionId: string): Promise<void> {
	const [sub] = await db
		.select({ id: schema.substitutions.id, source: schema.substitutions.source })
		.from(schema.substitutions)
		.where(eq(schema.substitutions.id, substitutionId));
	if (!sub) throw new ModerationError(404, 'No such substitution');
	// "Recognized" is specifically the community-earned-trust label — a curated `system`
	// substitution is already the official option and was never eligible (substitution.ts's own
	// `isEligibleForRecognition`). Enforced here too, not only in the UI that offers the button.
	if (sub.source !== 'community') {
		throw new ModerationError(400, 'Only community substitutions can be recognized');
	}
	await db
		.insert(schema.recognizedSubstitutions)
		.values({ substitutionId, recognizedAt: new Date().toISOString() })
		.onConflictDoNothing();
}

export async function unmarkRecognized(db: Db, substitutionId: string): Promise<void> {
	await db
		.delete(schema.recognizedSubstitutions)
		.where(eq(schema.recognizedSubstitutions.substitutionId, substitutionId));
}
