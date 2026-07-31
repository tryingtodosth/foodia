// Comment moderation (CLAUDE.md 4.4/Section 7 item 7) — this app's 7th `.svelte.ts` rune store,
// same "object of getters + methods wrapping module-level $state" idiom profile/pantry/mealPlan/
// uiLocale/auth/stepAlternatives already establish. Deliberately a CROSS-ROUTE store, not
// page-local — Session 11's own step-alternatives fix already established why: a report filed on
// `/recipes/[id]` has to still be there the moment a moderator opens `/moderation` from a
// completely different page load.
//
// Session 26 — this stopped being session-only. It's now a client-side CACHE of real
// `comment_reports` rows in D1 (`/api/comment-reports`), hydrated once per tab and updated
// optimistically-but-verified: every mutation awaits the server and adopts the row the server
// actually wrote, rather than trusting its own local guess. That distinction matters more here
// than in most stores — a queue that says "removed" while the database says "pending" is worse
// than no queue at all.
//
// The Capacitor build keeps the original in-memory behavior verbatim (no server exists there to
// call, by definition — see lib/server/api/client.ts's own header comment), which is why every
// method still has a `__IS_CAPACITOR__` branch rather than one unconditional network path.
import type { CommentReport, CommentReportReason } from '$lib/types/moderation';
import type { UserRef } from '$lib/types/recipe';

let reports = $state<CommentReport[]>([]);
let hydrated = $state(false);

export const commentModerationStore = {
	get all(): CommentReport[] {
		return reports;
	},
	get hydrated(): boolean {
		return hydrated;
	},
	pendingReports(): CommentReport[] {
		return reports
			.filter((r) => r.status === 'pending')
			.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	},
	resolvedReports(): CommentReport[] {
		return reports
			.filter((r) => r.status !== 'pending')
			.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	},
	/** A comment can only ever have ONE live pending report at a time — filing a second one while
	 *  the first is still under review would just duplicate the same queue entry, so the report
	 *  button disables itself once this is true (see CommentItem.svelte). The server enforces the
	 *  same rule with a 409, so this staying in sync is a convenience, not the guarantee. */
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
	/** Client-only and lazy, same discipline every other store's own hydrate() documents. Fire-and-
	 *  forget: the root layout calls it alongside the others and never awaits it. An anonymous
	 *  visitor gets an empty list from the server, which is the correct answer, not a failure. */
	hydrate(): void {
		if (hydrated) return;
		if (__IS_CAPACITOR__) {
			hydrated = true;
			return;
		}
		fetch('/api/comment-reports')
			.then((res) => res.json())
			.then((data) => {
				reports = data.reports ?? [];
			})
			.catch(() => {
				// An empty cache is the honest failure mode: an empty queue is visibly empty, whereas
				// stale-but-plausible rows would look like real state.
				reports = [];
			})
			.finally(() => {
				hydrated = true;
			});
	},
	async report(input: {
		commentId: string;
		recipeId: string;
		recipeName: string;
		targetLabel: string;
		commentContent: string;
		commentAuthor: UserRef;
		reason: CommentReportReason;
		reportedBy: UserRef;
	}): Promise<{ success: boolean }> {
		if (__IS_CAPACITOR__) {
			reports = [
				...reports,
				{ id: crypto.randomUUID(), status: 'pending', createdAt: new Date().toISOString(), ...input }
			];
			return { success: true };
		}

		// Only the two fields the server can't derive get sent — the rest of `input` is context the
		// caller already has, which the server deliberately re-derives from D1 instead of trusting
		// (see lib/server/api/moderation.ts's own header comment).
		const res = await fetch('/api/comment-reports', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ commentId: input.commentId, reason: input.reason })
		}).catch(() => null);
		if (!res?.ok) return { success: false };
		const { report } = (await res.json()) as { report: CommentReport };
		reports = [...reports, report];
		return { success: true };
	},
	async resolve(reportId: string, action: 'remove' | 'dismiss'): Promise<{ success: boolean }> {
		if (__IS_CAPACITOR__) {
			reports = reports.map((r) =>
				r.id === reportId ? { ...r, status: action === 'remove' ? 'removed' : 'dismissed' } : r
			);
			return { success: true };
		}

		const res = await fetch(`/api/comment-reports/${reportId}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ action })
		}).catch(() => null);
		if (!res?.ok) return { success: false };
		const { report } = (await res.json()) as { report: CommentReport };
		reports = reports.map((r) => (r.id === report.id ? report : r));
		return { success: true };
	}
};
