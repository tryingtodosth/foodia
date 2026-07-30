<script lang="ts">
	import type { NodeComment } from '$lib/types/recipe';
	import type { CommentReportReason } from '$lib/types/moderation';
	import { commentModerationStore } from '$lib/state/commentModeration.svelte';
	import { currentUserRef } from '$lib/state/profile.svelte';
	import { t } from '$lib/i18n/t';
	import ReactionButtons from './ReactionButtons.svelte';

	// `context` is optional — every real call site (recipes/[id]/+page.svelte) passes it, but
	// keeping it optional means a future consumer of this component isn't forced to plumb through
	// recipe/target info just to render a comment; the report affordance simply doesn't render
	// without it, since a report needs somewhere real to point back to (CLAUDE.md 4.4/Section 7
	// item 7 — "comment moderation," reusing 2do's own "bad-actor report, reviewed by a moderator"
	// shape rather than inventing a new one).
	let {
		comment,
		context
	}: {
		comment: NodeComment;
		context?: { recipeId: string; recipeName: string; targetLabel: string };
	} = $props();

	let reporting = $state(false);
	let reason = $state<CommentReportReason>('spam');

	let status = $derived(commentModerationStore.statusFor(comment.id));
	let alreadyReported = $derived(commentModerationStore.hasPendingReport(comment.id));

	function submitReport() {
		if (!context) return;
		commentModerationStore.report({
			commentId: comment.id,
			recipeId: context.recipeId,
			recipeName: context.recipeName,
			targetLabel: context.targetLabel,
			commentContent: comment.content,
			commentAuthor: comment.author,
			reason,
			reportedBy: currentUserRef()
		});
		reporting = false;
		reason = 'spam';
	}
</script>

{#if status === 'removed'}
	<p class="node-comment node-comment--removed">🚫 {t('moderation.commentRemoved')}</p>
{:else}
	<p class="node-comment" class:private={comment.visibility === 'private'}>
		<span class="node-comment__head">
			{comment.visibility === 'private' ? '🔒' : '💬'}
			<strong><a href={`/users/${comment.author.id}`}>{comment.author.displayName}</a>:</strong>
		</span>
		{comment.content}
		{#if comment.visibility === 'public'}
			<!-- Voting on your own private note would be meaningless — only public, community-facing
			     suggestions get upvote/downvote (CLAUDE.md 4.4/6.4). Same reasoning applies to
			     reporting: nobody but the author can even see a private note to report it. -->
			<ReactionButtons reactions={comment.reactions} compact />
			{#if context}
				{#if alreadyReported}
					<span class="report-status">{t('moderation.reportedLabel')}</span>
				{:else if !reporting}
					<button type="button" class="report-toggle" onclick={() => (reporting = true)}>
						{t('moderation.reportToggle')}
					</button>
				{/if}
			{/if}
		{/if}
	</p>
	{#if reporting}
		<form
			class="report-form"
			onsubmit={(e) => {
				e.preventDefault();
				submitReport();
			}}
		>
			<label>
				{t('moderation.reportReasonLabel')}:
				<select bind:value={reason}>
					<option value="spam">{t('moderation.reasonSpam')}</option>
					<option value="abuse">{t('moderation.reasonAbuse')}</option>
					<option value="unsafe">{t('moderation.reasonUnsafe')}</option>
					<option value="other">{t('moderation.reasonOther')}</option>
				</select>
			</label>
			<div class="report-form__actions">
				<button type="button" class="btn btn--ghost" onclick={() => (reporting = false)}>
					{t('comment.cancel')}
				</button>
				<button type="submit" class="btn btn--primary">{t('moderation.reportSubmit')}</button>
			</div>
		</form>
	{/if}
{/if}

<style lang="scss">
	.node-comment {
		font-size: 13px;
		margin: var(--space-1) 0 0;
		padding-left: var(--space-3);
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);

		&.private {
			color: var(--text-secondary);
			font-style: italic;
		}
		&--removed {
			color: var(--text-secondary);
			font-style: italic;
		}
	}
	.node-comment__head {
		display: contents;
	}
	.report-toggle,
	.report-status {
		background: none;
		border: none;
		font-family: inherit;
		font-size: 11px;
		color: var(--text-secondary);
		cursor: pointer;
		padding: 0;

		&:hover {
			color: var(--status-danger);
		}
	}
	.report-status {
		cursor: default;
		font-style: italic;

		&:hover {
			color: var(--text-secondary);
		}
	}
	.report-form {
		margin: var(--space-1) 0 0;
		padding-left: var(--space-3);
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
		font-size: 12px;
		color: var(--text-secondary);

		select {
			font-family: inherit;
			font-size: 12px;
			margin-left: var(--space-1);
		}
	}
	.report-form__actions {
		display: flex;
		gap: var(--space-2);
	}
</style>
