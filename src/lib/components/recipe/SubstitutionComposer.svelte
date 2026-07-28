<script lang="ts">
	// The write-side of Ingredient Alternatives (CLAUDE.md 4.2) — collapsed by default, same
	// "toggle reveals a form" shape CommentComposer.svelte already established. Deliberately only
	// asks for a name and a quantity ratio, never deltaMacros: a community member proposing "use
	// 4 cloves instead of 2" has no way to know the precise macro impact, and shouldn't have to —
	// `applySubstitution` (lib/utils/substitution.ts) already treats an absent `deltaMacros` as a
	// zero delta, so a community submission simply doesn't claim a macro change, only "system"
	// (recipe-author-curated) substitutions bother calculating one.
	import { t } from '$lib/i18n/t';

	let { onsubmit }: { onsubmit: (name: string, ratio: number) => void } = $props();

	let open = $state(false);
	let name = $state('');
	let ratio = $state(1);

	function submit() {
		const trimmed = name.trim();
		if (!trimmed) return;
		onsubmit(trimmed, ratio);
		name = '';
		ratio = 1;
		open = false;
	}

	function cancel() {
		open = false;
		name = '';
		ratio = 1;
	}
</script>

{#if !open}
	<button type="button" class="composer-toggle" onclick={() => (open = true)}>
		{t('substitution.proposeToggle')}
	</button>
{:else}
	<form
		class="composer"
		onsubmit={(e) => {
			e.preventDefault();
			submit();
		}}
	>
		<input type="text" bind:value={name} placeholder={t('substitution.namePlaceholder')} required />
		<label class="composer__ratio">
			{t('substitution.ratioLabel')}
			<input type="number" min="0.1" step="0.1" bind:value={ratio} />
		</label>
		<div class="composer__actions">
			<button type="button" class="btn btn--ghost" onclick={cancel}>{t('comment.cancel')}</button>
			<button type="submit" class="btn btn--primary">{t('comment.add')}</button>
		</div>
	</form>
{/if}

<style lang="scss">
	.composer-toggle {
		background: none;
		border: none;
		color: var(--text-secondary);
		font-size: 12px;
		cursor: pointer;
		font-family: inherit;
		padding: var(--space-1) 0;

		&:hover {
			color: var(--accent);
		}
	}
	.composer {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
		margin-top: var(--space-1);

		input[type='text'] {
			flex: 1;
			min-width: 120px;
			padding: var(--space-1) var(--space-2);
			border-radius: var(--radius-card);
			border: 1px solid var(--bg-surface-alt);
			font-size: 13px;
			font-family: inherit;
		}
	}
	.composer__ratio {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		font-size: 12px;
		color: var(--text-secondary);
		white-space: nowrap;

		input {
			width: 56px;
			padding: var(--space-1);
			border-radius: var(--radius-card);
			border: 1px solid var(--bg-surface-alt);
			font-size: 13px;
			font-family: inherit;
		}
	}
	.composer__actions {
		display: flex;
		gap: var(--space-1);
	}
</style>
