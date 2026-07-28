// Comment moderation (CLAUDE.md 4.4/Section 7 item 7) — a real report/review flow, reusing the
// same "bad-actor report, reviewed by a moderator" shape `2do`'s own Report system already
// establishes (deliberately not its full 9-status `CommentStatus` enum — this app's own comment
// model has no such states yet, only a report/removed lifecycle layered on top via a separate
// cross-route store, `commentModeration.svelte.ts`, never mutating the loaded comment itself).
import type { UserRef } from './recipe';

export type CommentReportReason = 'spam' | 'abuse' | 'unsafe' | 'other';
export type CommentReportStatus = 'pending' | 'removed' | 'dismissed';

export interface CommentReport {
	id: string;
	commentId: string;
	/** Denormalized at report time, not looked up later — the reporting UI already has this
	 *  context on hand (the comment it's attached to, which recipe/ingredient/step), and denormalizing
	 *  it here is what lets `/moderation` render a useful queue without re-scanning the whole recipe
	 *  corpus for context, the same "carry a label, avoid a lookup" convention `2do`'s own
	 *  `Relationship.to.label` already establishes. */
	recipeId: string;
	recipeName: string;
	targetLabel: string;
	commentContent: string;
	commentAuthor: UserRef;
	reason: CommentReportReason;
	reportedBy: UserRef;
	status: CommentReportStatus;
	createdAt: string;
}
