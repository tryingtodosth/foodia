<script lang="ts">
	import type { NodeComment } from '$lib/types/recipe';
	import type { CommentReportReason } from '$lib/types/moderation';
	import { commentModerationStore } from '$lib/state/commentModeration.svelte';
	import { authStore } from '$lib/state/auth.svelte';
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
	let submitting = $state(false);
	let reportError = $state(false);

	// Two independent sources of "this was removed," and both matter (Session 26): the server's own
	// flag, which every viewer gets from the read path and which survives a reload, and the local
	// store, which is what makes a removal the current moderator just performed take effect
	// immediately without a refetch. Either one is sufficient.
	let status = $derived(
		comment.removed === true || commentModerationStore.statusFor(comment.id) === 'removed'
			? 'removed'
			: 'visible'
	);
	let alreadyReported = $derived(commentModerationStore.hasPendingReport(comment.id));

	// Filing a report needs a real account now that reports are D1 rows (a report with no identity
	// behind it can't be weighed or followed up on — /api/comment-reports' own 401). So the button
	// is only offered to someone who can actually use it, rather than offered to everyone and
	// failing on click. The Capacitor build keeps its session-only local reports, which never
	// needed a server or an account.
	let canReport = $derived(__IS_CAPACITOR__ || (authStore.hydrated && authStore.isAuthenticated));

	// Filing a report is a real network write now (Session 26), so this awaits the result instead
	// of assuming it: silently closing the form on a failed POST would tell the reporter their
	// report was filed when no row exists anywhere.
	async function submitReport() {
		if (!context || submitting) return;
		submitting = true;
		const { success } = await commentModerationStore.report({
			commentId: comment.id,
			recipeId: context.recipeId,
			recipeName: context.recipeName,
			targetLabel: context.targetLabel,
			commentContent: comment.content,
			commentAuthor: comment.author,
			reason,
			reportedBy: currentUserRef()
		});
		submitting = false;
		if (!success) {
			reportError = true;
			return;
		}
		reporting = false;
		reportError = false;
		reason = 'spam';
	}
</script>

{#if status === 'removed'}
	<p class="node-comment node-comment--removed">🚫 {t('moderation.commentRemoved')}</p>
{:else}
	<p
		class="node-comment"
		class:private={comment.visibility === 'private'}
		class:story={comment.kind === 'story'}
	>
		<span class="node-comment__head">
			<!-- A story gets its own mark even when it's private: the icon says what this IS, the
			     italic/muted treatment above says who can see it — two different facts, and collapsing
			     them would make a private story indistinguishable from a private one-line note. -->
			{comment.visibility === 'private' ? '🔒' : comment.kind === 'story' ? '📖' : '💬'}
			<strong><a href={`/users/${comment.author.id}`}>{comment.author.displayName}</a>:</strong>
		</span>
		{comment.content}
		{#if comment.imageUrl}
			<!-- Deliberately no `loading="lazy"`: these render inside an already-collapsed thread, so
			     they're only in the DOM once someone has opened it and is looking straight at them.
			     Empty alt — the comment text beside it is the description; a generated one ("photo by
			     Ania") would be noise a screen reader has to sit through on every single row. -->
			<img class="node-comment__photo" src={comment.imageUrl} alt="" />
		{/if}
		{#if comment.visibility === 'public'}
			<!-- Voting on your own private note would be meaningless — only public, community-facing
			     suggestions get upvote/downvote (CLAUDE.md 4.4/6.4). Same reasoning applies to
			     reporting: nobody but the author can even see a private note to report it. -->
			<ReactionButtons reactions={comment.reactions} compact />
			{#if context && canReport}
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
				<button type="submit" class="btn btn--primary" disabled={submitting}>
					{submitting ? t('admin.saving') : t('moderation.reportSubmit')}
				</button>
			</div>
			{#if reportError}
				<p class="report-form__error">{t('admin.actionFailed')}</p>
			{/if}
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
		&.story {
			// A story is prose, not a one-liner — it gets room to breathe and a left rule marking it
			// as a different kind of contribution, without changing the type size the rest of the
			// thread reads at.
			display: block;
			margin-top: var(--space-2);
			padding: var(--space-2) var(--space-3);
			border-left: 2px solid var(--accent);
			background: var(--bg-surface-alt);
			border-radius: 0 var(--radius-card) var(--radius-card) 0;
			line-height: 1.5;
		}
	}
	.node-comment__head {
		display: contents;
	}
	.node-comment__photo {
		// `flex-basis: 100%` puts the photo on its own line inside the flex row rather than squeezed
		// beside the text — and is a no-op under `.story`'s `display: block`, where it already is.
		flex-basis: 100%;
		max-width: 220px;
		max-height: 180px;
		object-fit: cover;
		border-radius: var(--radius-card);
		margin-top: var(--space-1);
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
	.report-form__error {
		margin: 0;
		padding-left: var(--space-3);
		font-size: 12px;
		color: var(--status-danger);
	}
	.report-form__actions {
		display: flex;
		gap: var(--space-2);
	}
</style>
