<script lang="ts">
	import { t } from '$lib/i18n/t';

	// The write-side of Module 4's node-based comments (CLAUDE.md 4.4) — collapsed by default so
	// a recipe with many ingredients/steps doesn't show an open textarea under every single one.
	// `onsubmit` may return a Promise<boolean> (Session 22 — now a real POST /api/comments call,
	// not a synchronous local push): true collapses the form, false/rejection keeps it open with
	// the entered text intact and shows an inline error, rather than silently discarding it.
	let {
		onsubmit
	}: { onsubmit: (content: string, visibility: 'public' | 'private') => boolean | Promise<boolean> | void } =
		$props();

	let open = $state(false);
	let content = $state('');
	let visibility = $state<'public' | 'private'>('public');
	let submitting = $state(false);
	let failed = $state(false);

	async function submit() {
		const trimmed = content.trim();
		if (!trimmed) return;
		failed = false;
		submitting = true;
		const result = await onsubmit(trimmed, visibility);
		submitting = false;
		if (result === false) {
			failed = true;
			return;
		}
		content = '';
		visibility = 'public';
		open = false;
	}

	function cancel() {
		open = false;
		content = '';
		visibility = 'public';
		failed = false;
	}
</script>

{#if !open}
	<button type="button" class="composer-toggle" onclick={() => (open = true)}>
		{t('comment.addToggle')}
	</button>
{:else}
	<form
		class="composer"
		onsubmit={(e) => {
			e.preventDefault();
			submit();
		}}
	>
		<textarea bind:value={content} placeholder={t('comment.placeholder')} rows="2"></textarea>
		{#if failed}
			<p class="composer__error">{t('comment.postError')}</p>
		{/if}
		<div class="composer__row">
			<label class="composer__visibility">
				<input
					type="checkbox"
					checked={visibility === 'private'}
					onchange={(e) => (visibility = e.currentTarget.checked ? 'private' : 'public')}
				/>
				{t('comment.privateLabel')}
			</label>
			<div class="composer__actions">
				<button type="button" class="btn btn--ghost" onclick={cancel}>{t('comment.cancel')}</button>
				<button type="submit" class="btn btn--primary" disabled={submitting}>{t('comment.add')}</button>
			</div>
		</div>
	</form>
{/if}

<style lang="scss">
	.composer-toggle {
		margin-top: var(--space-1);
		padding-left: var(--space-3);
		background: none;
		border: none;
		color: var(--text-secondary);
		font-size: 12px;
		cursor: pointer;
		font-family: inherit;

		&:hover {
			color: var(--accent);
		}
	}
	.composer {
		margin-top: var(--space-2);
		padding-left: var(--space-3);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);

		textarea {
			width: 100%;
			padding: var(--space-2);
			border-radius: var(--radius-card);
			border: 1px solid var(--bg-surface-alt);
			font-family: inherit;
			font-size: 13px;
			resize: vertical;
		}
	}
	.composer__error {
		margin: 0;
		font-size: 12px;
		color: var(--status-danger);
	}
	.composer__row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
	.composer__visibility {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		font-size: 12px;
		color: var(--text-secondary);
	}
	.composer__actions {
		display: flex;
		gap: var(--space-2);
	}
</style>
