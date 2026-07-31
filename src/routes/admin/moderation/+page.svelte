<script lang="ts">
	// The same two queues /moderation has, but reading real D1 rows through this page's own server
	// load instead of a client-side store, and with resolved reports shown too — an audit trail of
	// what was already acted on, which /moderation never had.
	import { invalidateAll } from '$app/navigation';
	import { isEligibleForRecognition, netReactionScore } from '$lib/utils/substitution';
	import { t } from '$lib/i18n/t';
	import type { MessageKey } from '$lib/i18n/messages';
	import type { CommentReportReason } from '$lib/types/moderation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let busyId = $state<string | null>(null);
	let actionError = $state(false);

	function reportReasonLabel(reason: CommentReportReason): string {
		const capitalized = reason.charAt(0).toUpperCase() + reason.slice(1);
		return t(`moderation.reason${capitalized}` as MessageKey);
	}

	let pending = $derived(data.reports.filter((r) => r.status === 'pending'));
	let resolved = $derived(data.reports.filter((r) => r.status !== 'pending'));

	// Same flat, denormalized view /moderation builds — every substitution across the corpus with
	// enough context to judge it.
	let allSubs = $derived(
		data.recipes.flatMap((recipe) =>
			recipe.ingredients.flatMap((ingredient) =>
				(ingredient.substitutions ?? []).map((sub) => ({
					recipeName: recipe.name,
					ingredientName: ingredient.name,
					sub
				}))
			)
		)
	);
	let eligible = $derived(
		allSubs.filter((x) => isEligibleForRecognition(x.sub) && !data.recognizedIds.includes(x.sub.id))
	);
	let recognized = $derived(allSubs.filter((x) => data.recognizedIds.includes(x.sub.id)));

	async function call(id: string, url: string, init: RequestInit) {
		busyId = id;
		actionError = false;
		const res = await fetch(url, init).catch(() => null);
		busyId = null;
		if (!res?.ok) {
			actionError = true;
			return;
		}
		await invalidateAll();
	}

	function resolveReport(id: string, action: 'remove' | 'dismiss') {
		call(id, `/api/comment-reports/${id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ action })
		});
	}

	function recognize(substitutionId: string) {
		call(substitutionId, '/api/recognized-substitutions', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ substitutionId })
		});
	}

	function unrecognize(substitutionId: string) {
		call(substitutionId, `/api/recognized-substitutions/${substitutionId}`, { method: 'DELETE' });
	}
</script>

{#if actionError}
	<p class="error">{t('admin.actionFailed')}</p>
{/if}

<section>
	<h2>{t('admin.moderation.heading')} ({pending.length})</h2>
	{#if pending.length === 0}
		<p class="empty">{t('admin.moderation.empty')}</p>
	{:else}
		<ul class="queue">
			{#each pending as report (report.id)}
				<li class="queue-item" class:busy={busyId === report.id}>
					<p class="queue-item__content">"{report.commentContent}"</p>
					<p class="queue-item__meta">
						<a href={`/users/${report.commentAuthor.id}`}>{report.commentAuthor.displayName}</a> ·
						{t('moderation.onRecipeLabel')}
						<a href={`/recipes/${report.recipeId}`}>{report.recipeName}</a> — {report.targetLabel} ·
						{t('moderation.reportReasonLabel')}: {reportReasonLabel(report.reason)} ·
						{t('moderation.reportedByLabel')}
						<a href={`/users/${report.reportedBy.id}`}>{report.reportedBy.displayName}</a>
					</p>
					<div class="queue-item__actions">
						<button
							type="button"
							class="btn btn--primary"
							disabled={busyId === report.id}
							onclick={() => resolveReport(report.id, 'remove')}
						>
							{t('moderation.removeAction')}
						</button>
						<button
							type="button"
							class="btn btn--ghost"
							disabled={busyId === report.id}
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

{#if resolved.length > 0}
	<section>
		<h2>{t('admin.moderation.resolvedHeading')} ({resolved.length})</h2>
		<ul class="queue">
			{#each resolved as report (report.id)}
				<li class="queue-item queue-item--muted">
					<p class="queue-item__content">"{report.commentContent}"</p>
					<p class="queue-item__meta">
						{t(`activity.status.${report.status}` as MessageKey)} · {report.recipeName} — {report.targetLabel}
						· {reportReasonLabel(report.reason)}
					</p>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<section>
	<h2>{t('moderation.eligibleHeading')} ({eligible.length})</h2>
	{#if eligible.length === 0}
		<p class="empty">{t('moderation.noEligible')}</p>
	{:else}
		<ul class="queue">
			{#each eligible as entry (entry.sub.id)}
				<li class="queue-item" class:busy={busyId === entry.sub.id}>
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
							disabled={busyId === entry.sub.id}
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

{#if recognized.length > 0}
	<section>
		<h2>{t('moderation.recognizedHeading')} ({recognized.length})</h2>
		<ul class="queue">
			{#each recognized as entry (entry.sub.id)}
				<li class="queue-item" class:busy={busyId === entry.sub.id}>
					<p class="queue-item__content">⭐ {entry.sub.name}</p>
					<p class="queue-item__meta">{entry.recipeName} — {entry.ingredientName}</p>
					<div class="queue-item__actions">
						<button
							type="button"
							class="btn btn--ghost"
							disabled={busyId === entry.sub.id}
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

<style lang="scss">
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
	.queue-item--muted {
		opacity: 0.7;
	}
	.queue-item.busy {
		opacity: 0.5;
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
	.error {
		color: var(--status-danger);
		font-size: 13px;
	}
	.empty {
		color: var(--text-secondary);
		font-size: 14px;
	}
</style>
