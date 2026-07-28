// Comment moderation (CLAUDE.md 4.4/Section 7 item 7) — this app's 7th `.svelte.ts` rune store,
// same "object of getters + methods wrapping module-level $state" idiom profile/pantry/mealPlan/
// uiLocale/auth/stepAlternatives already establish. Deliberately a CROSS-ROUTE store, not
// page-local — Session 11's own step-alternatives fix already established why: a report filed on
// `/recipes/[id]` has to still be there the moment a moderator opens `/moderation` from a
// completely different page load. Session-only, same honesty every rune store in this app
// carries: nothing here survives a hard reload.
import type { CommentReport, CommentReportReason } from '$lib/types/moderation';
import type { UserRef } from '$lib/types/recipe';

let reports = $state<CommentReport[]>([]);

export const commentModerationStore = {
	get all(): CommentReport[] {
		return reports;
	},
	pendingReports(): CommentReport[] {
		return reports
			.filter((r) => r.status === 'pending')
			.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	},
	/** A comment can only ever have ONE live pending report at a time — filing a second one while
	 *  the first is still under review would just duplicate the same queue entry, so the report
	 *  button disables itself once this is true (see CommentItem.svelte). */
	hasPendingReport(commentId: string): boolean {
		return reports.some((r) => r.commentId === commentId && r.status === 'pending');
	},
	/** `'removed'` only once a moderator actually acts — a report merely being `'pending'` does
	 *  NOT hide the comment, matching how real moderation review works (the content stays visible
	 *  while under review, not pre-emptively hidden on a single unverified report). */
	statusFor(commentId: string): 'visible' | 'removed' {
		return reports.some((r) => r.commentId === commentId && r.status === 'removed')
			? 'removed'
			: 'visible';
	},
	report(input: {
		commentId: string;
		recipeId: string;
		recipeName: string;
		targetLabel: string;
		commentContent: string;
		commentAuthor: UserRef;
		reason: CommentReportReason;
		reportedBy: UserRef;
	}): void {
		reports = [
			...reports,
			{
				id: crypto.randomUUID(),
				status: 'pending',
				createdAt: new Date().toISOString(),
				...input
			}
		];
	},
	resolve(reportId: string, action: 'remove' | 'dismiss'): void {
		reports = reports.map((r) =>
			r.id === reportId ? { ...r, status: action === 'remove' ? 'removed' : 'dismissed' } : r
		);
	}
};
