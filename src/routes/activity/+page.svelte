<script lang="ts">
	// The Private Audit Log (FUTURES.md Section 9.2) — "what happened to my account," not a public
	// activity feed (that's a different, unbuilt idea, FUTURES.md 9.2's own rejected options A/C).
	// Deliberately no +page.server.ts, matching /shopping-list's own precedent: every field this
	// page needs (reportedBy, commentAuthor, denormalized recipe/target context) already lives on
	// `CommentReport` itself, so there's nothing a server load could usefully prefetch — same "plain
	// +page.svelte, store-driven" reasoning, not a coincidence.
	import { commentModerationStore } from '$lib/state/commentModeration.svelte';
	import { authStore } from '$lib/state/auth.svelte';
	import { currentUserRef } from '$lib/state/profile.svelte';
	import { reportsFiledBy, ownCommentsRemoved } from '$lib/utils/activityLog';
	import { t } from '$lib/i18n/t';
	import type { MessageKey } from '$lib/i18n/messages';
	import type { CommentReportStatus } from '$lib/types/moderation';

	let me = $derived(currentUserRef());
	let myReports = $derived(reportsFiledBy(commentModerationStore.all, me.id));
	let myRemovedComments = $derived(ownCommentsRemoved(commentModerationStore.all, me.id));

	function statusLabel(status: CommentReportStatus): string {
		return t(`activity.status.${status}` as MessageKey);
	}
</script>

<svelte:head>
	<title>{t('activity.pageTitle')} — Foodia</title>
	<!-- Same "personal, not a public/indexable page" treatment /moderation already gives itself. -->
	<meta name="robots" content="noindex" />
</svelte:head>

<h1>{t('activity.pageTitle')}</h1>
<p class="lede">{t('activity.lede')}</p>

<section>
	<h2>{t('activity.accountHeading')}</h2>
	{#if authStore.isAuthenticated && authStore.account}
		<p>{t('activity.accountAuthenticated', { name: authStore.account.displayName })}</p>
	{:else}
		<p class="muted">{t('activity.accountAnonymous')}</p>
	{/if}
</section>

<section>
	<h2>{t('activity.reportsHeading')}</h2>
	{#if myReports.length === 0}
		<p class="empty">{t('activity.reportsEmpty')}</p>
	{:else}
		<ul class="log">
			{#each myReports as report (report.id)}
				<li class="log-item">
					<p class="log-item__content">"{report.commentContent}"</p>
					<p class="log-item__meta">
						{t('moderation.onRecipeLabel')} {report.recipeName} — {report.targetLabel}
					</p>
					<span class="status-badge status-badge--{report.status}">{statusLabel(report.status)}</span>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<section>
	<h2>{t('activity.removedHeading')}</h2>
	{#if myRemovedComments.length === 0}
		<p class="empty">{t('activity.removedEmpty')}</p>
	{:else}
		<ul class="log">
			{#each myRemovedComments as report (report.id)}
				<li class="log-item">
					<p class="log-item__content">"{report.commentContent}"</p>
					<p class="log-item__meta">
						{t('moderation.onRecipeLabel')} {report.recipeName} — {report.targetLabel}
					</p>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<section class="not-yet">
	<h2>{t('activity.notYetHeading')}</h2>
	<p class="muted">{t('activity.notYetBody')}</p>
</section>

<style lang="scss">
	.lede {
		color: var(--text-secondary);
	}
	section {
		margin-top: var(--space-5);
	}
	.muted {
		color: var(--text-secondary);
		font-size: 14px;
	}
	.empty {
		color: var(--text-secondary);
		font-size: 14px;
	}
	.log {
		list-style: none;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.log-item {
		padding: var(--space-3);
		border: 1px solid var(--bg-surface-alt);
		border-radius: var(--radius-card);
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.log-item__content {
		margin: 0;
		font-style: italic;
	}
	.log-item__meta {
		margin: 0;
		font-size: 13px;
		color: var(--text-secondary);
	}
	.status-badge {
		align-self: flex-start;
		font-size: 12px;
		padding: 2px 10px;
		border-radius: var(--radius-pill);
		background: var(--bg-surface-alt);

		&--removed {
			background: var(--status-warning);
			color: white;
		}
	}
	.not-yet {
		padding-top: var(--space-4);
		border-top: 1px solid var(--bg-surface-alt);
	}
</style>
