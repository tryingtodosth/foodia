// The Private Audit Log (FUTURES.md Section 9.2) — pure, framework-agnostic functions (no Svelte
// import), same discipline substitution.ts/hardware.ts/week.ts/recipeFilter.ts already follow.
//
// Deliberately NOT built as a new store or a new data shape — `CommentReport` (moderation.ts)
// already carries every field this needs (reportedBy, commentAuthor, status, timestamps), so this
// module is just two filters over the existing `commentModerationStore.all`, the same "reuse what
// already exists, don't invent a second mechanism" discipline `translations.ts`'s own header
// comment already states for an analogous case.
import type { CommentReport } from '$lib/types/moderation';

/** Reports the current user filed themselves — the missing "did anything happen after I tapped
 *  🚩 Zgłoś" surface named directly in FUTURES.md 9.6 ("nothing exists for the person who filed
 *  it, who today gets no visible outcome at all") and re-confirmed as a real gap by QA.md's own
 *  live pass (Issue #3's own combined S18→S17 verification). */
export function reportsFiledBy(reports: CommentReport[], userId: string): CommentReport[] {
	return reports
		.filter((r) => r.reportedBy.id === userId)
		.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** The other half of "what happened to my account" — a comment of MINE that a moderator actually
 *  removed (not just reported — a pending report never hides anything, matching the documented
 *  moderation model, so this deliberately only surfaces the 'removed' status, not 'pending'). */
export function ownCommentsRemoved(reports: CommentReport[], userId: string): CommentReport[] {
	return reports
		.filter((r) => r.commentAuthor.id === userId && r.status === 'removed')
		.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
