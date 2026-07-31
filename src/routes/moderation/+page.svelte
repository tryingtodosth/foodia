<script lang="ts">
	import { authStore } from '$lib/state/auth.svelte';
	import { commentModerationStore } from '$lib/state/commentModeration.svelte';
	import { substitutionModerationStore } from '$lib/state/substitutionModeration.svelte';
	import { isEligibleForRecognition, netReactionScore } from '$lib/utils/substitution';
	import { t } from '$lib/i18n/t';
	import type { MessageKey } from '$lib/i18n/messages';
	import type { CommentReportReason } from '$lib/types/moderation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Same "read t() with a built key" convention lib/utils/hardware.ts's equipmentMatchLabel
	// already establishes, rather than a switch/case per reason.
	function reportReasonLabel(reason: CommentReportReason): string {
		const capitalized = reason.charAt(0).toUpperCase() + reason.slice(1);
		return t(`moderation.reason${capitalized}` as MessageKey);
	}

	// A flat, denormalized view of every ingredient substitution across the whole (fixture) corpus
	// — the one thing this queue needs that neither `commentModerationStore` (which already carries
	// its own denormalized context at report time) nor a bare `Substitution` id needs on its own.
	let allSubsWithContext = $derived(
		data.recipes.flatMap((recipe) =>
			recipe.ingredients.flatMap((ingredient) =>
				(ingredient.substitutions ?? []).map((sub) => ({
					recipeId: recipe.id,
					recipeName: recipe.name,
					ingredientName: ingredient.name,
					sub
				}))
			)
		)
	);
	let eligibleSubs = $derived(
		allSubsWithContext.filter(
			(x) => isEligibleForRecognition(x.sub) && !substitutionModerationStore.isRecognized(x.sub.id)
		)
	);
	let recognizedSubs = $derived(
		allSubsWithContext.filter((x) => substitutionModerationStore.isRecognized(x.sub.id))
	);
	let pendingReports = $derived(commentModerationStore.pendingReports());

	// An admin gets in too, not just an `is_moderator` account — the ADMIN_EMAILS allowlist is
	// strictly above the moderator role, and locking the owner out of the moderation queue would be
	// a strange place to draw a line. `data.isAdmin` comes from the root layout's server load, so
	// it's server-resolved truth; the API routes behind every button below re-check it anyway.
	let canModerate = $derived(
		data.isAdmin === true || (authStore.hydrated && authStore.account?.isModerator === true)
	);

	// Every action here is a real network write now (Session 26) rather than a local array mutation,
	// so a failure has to be visible: silently leaving a report in the queue after a failed resolve
	// would read as "the click didn't register" and invite a second, equally failed attempt.
	let actionError = $state(false);

	async function resolveReport(reportId: string, action: 'remove' | 'dismiss') {
		const { success } = await commentModerationStore.resolve(reportId, action);
		actionError = !success;
	}
	async function recognize(substitutionId: string) {
		const { success } = await substitutionModerationStore.markRecognized(substitutionId);
		actionError = !success;
	}
	async function unrecognize(substitutionId: string) {
		const { success } = await substitutionModerationStore.unmark(substitutionId);
		actionError = !success;
	}
</script>

<svelte:head>
	<title>{t('moderation.pageTitle')} — Foodia</title>
	<!-- Same "dev/operational reference, not customer-facing content" treatment personali's own
	     /interface page and /admin console already give their internal tools. -->
	<meta name="robots" content="noindex" />
</svelte:head>

<h1>{t('moderation.pageTitle')}</h1>

{#if !authStore.hydrated}
	<!-- hydrate() hasn't run yet — same brief, honest pre-hydrate gap every other client-only gate
	     in this app has, not worth a loading spinner for. -->
{:else if !canModerate}
	<p class="access-denied">{t('moderation.accessDenied')}</p>
{:else}
	{#if actionError}
		<p class="action-error">{t('admin.actionFailed')}</p>
	{/if}
	<section>
		<h2>{t('moderation.pendingReportsHeading')}</h2>
		{#if pendingReports.length === 0}
			<p class="empty">{t('moderation.noReports')}</p>
		{:else}
			<ul class="queue">
				{#each pendingReports as report (report.id)}
					<li class="queue-item">
						<p class="queue-item__content">"{report.commentContent}"</p>
						<p class="queue-item__meta">
							<a href={`/users/${report.commentAuthor.id}`}>{report.commentAuthor.displayName}</a> ·
							{t('moderation.onRecipeLabel')}
							{report.recipeName} — {report.targetLabel} ·
							{t('moderation.reportReasonLabel')}: {reportReasonLabel(report.reason)} ·
							{t('moderation.reportedByLabel')}
							<a href={`/users/${report.reportedBy.id}`}>{report.reportedBy.displayName}</a>
						</p>
						<div class="queue-item__actions">
							<button
								type="button"
								class="btn btn--primary"
								onclick={() => resolveReport(report.id, 'remove')}
							>
								{t('moderation.removeAction')}
							</button>
							<button
								type="button"
								class="btn btn--ghost"
								onclick={() => resolveReport(report.id, 'dismiss')}
							>
								{t('moderation.dismissAction')}
							</button>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section>
		<h2>{t('moderation.eligibleHeading')}</h2>
		{#if eligibleSubs.length === 0}
			<p class="empty">{t('moderation.noEligible')}</p>
		{:else}
			<ul class="queue">
				{#each eligibleSubs as entry (entry.sub.id)}
					<li class="queue-item">
						<p class="queue-item__content">{entry.sub.name}</p>
						<p class="queue-item__meta">
							{entry.recipeName} — {entry.ingredientName} ·
							{t('moderation.netScore', { n: netReactionScore(entry.sub.reactions) })}
							{#if entry.sub.proposedBy}
								· <a href={`/users/${entry.sub.proposedBy.id}`}>{entry.sub.proposedBy.displayName}</a>
							{/if}
						</p>
						<div class="queue-item__actions">
							<button
								type="button"
								class="btn btn--primary"
								onclick={() => recognize(entry.sub.id)}
							>
								⭐ {t('moderation.markRecognized')}
							</button>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	{#if recognizedSubs.length > 0}
		<section>
			<h2>{t('moderation.recognizedHeading')}</h2>
			<ul class="queue">
				{#each recognizedSubs as entry (entry.sub.id)}
					<li class="queue-item">
						<p class="queue-item__content">⭐ {entry.sub.name}</p>
						<p class="queue-item__meta">{entry.recipeName} — {entry.ingredientName}</p>
						<div class="queue-item__actions">
							<button
								type="button"
								class="btn btn--ghost"
								onclick={() => unrecognize(entry.sub.id)}
							>
								{t('moderation.unmark')}
							</button>
						</div>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
{/if}

<style lang="scss">
	.access-denied {
		color: var(--text-secondary);
	}
	.action-error {
		color: var(--status-danger);
		font-size: 13px;
	}
	.empty {
		color: var(--text-secondary);
		font-size: 14px;
	}
	section {
		margin-bottom: var(--space-5);
	}
	.queue {
		list-style: none;
		padding: 0;
	}
	.queue-item {
		background: var(--bg-surface);
		border-radius: var(--radius-card);
		padding: var(--space-3);
		margin-bottom: var(--space-3);
	}
	.queue-item__content {
		margin: 0 0 var(--space-1);
		font-weight: 600;
	}
	.queue-item__meta {
		margin: 0 0 var(--space-2);
		font-size: 12px;
		color: var(--text-secondary);
	}
	.queue-item__actions {
		display: flex;
		gap: var(--space-2);
	}
</style>
