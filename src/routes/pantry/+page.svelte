<script lang="ts">
	import { pantryStore } from '$lib/state/pantry.svelte';
	import { t } from '$lib/i18n/t';
	import type { PantryItem } from '$lib/types/pantry';

	// P1 slice only (CLAUDE.md 4.5 / 6.1): no aggregation against a MealPlan yet, no e-grocery
	// export — just the checklist itself, client-only.
	let name = $state('');
	let quantity = $state(1);
	let unit = $state('szt');

	function addItem() {
		pantryStore.add({ ingredientName: name, quantity, unit });
		name = '';
		quantity = 1;
		unit = 'szt';
	}

	// Session 24 — "easy to remove, but impossible to add back again." Only the most recent removal
	// is undo-able (a new removal replaces the pending one, the same single-slot "Undo" snackbar
	// convention most apps use — not a stacked history), and it auto-clears after a real window to
	// act, not indefinitely.
	let lastRemoved = $state<PantryItem | null>(null);
	let undoTimeout: ReturnType<typeof setTimeout> | undefined;

	function removeItem(id: string) {
		const removed = pantryStore.markUsed(id);
		if (!removed) return;
		lastRemoved = removed;
		clearTimeout(undoTimeout);
		undoTimeout = setTimeout(() => {
			lastRemoved = null;
		}, 6000);
	}

	function undoRemove() {
		if (!lastRemoved) return;
		pantryStore.restore(lastRemoved);
		lastRemoved = null;
		clearTimeout(undoTimeout);
	}
</script>

<svelte:head>
	<title>{t('pantry.title')} — Foodia</title>
</svelte:head>

<h1>{t('pantry.title')}</h1>
<p class="lede">{t('pantry.lede')}</p>

<form
	class="add-form"
	onsubmit={(e) => {
		e.preventDefault();
		addItem();
	}}
>
	<input type="text" placeholder={t('pantry.namePlaceholder')} bind:value={name} required />
	<input type="number" min="0" step="0.1" bind:value={quantity} aria-label={t('pantry.quantityLabel')} />
	<input type="text" placeholder={t('pantry.unitPlaceholder')} bind:value={unit} aria-label={t('pantry.unitLabel')} />
	<button type="submit" class="btn btn--primary">{t('pantry.add')}</button>
</form>

{#if pantryStore.hydrated && pantryStore.items.length === 0}
	<p class="empty">{t('pantry.empty')}</p>
{/if}

<ul class="pantry-list">
	{#each pantryStore.items as item (item.id)}
		<li>
			<span>{item.quantity} {item.unit} {item.ingredientName}</span>
			<button class="btn btn--ghost" onclick={() => removeItem(item.id)}>
				{t('pantry.used')}
			</button>
		</li>
	{/each}
</ul>

{#if lastRemoved}
	<div class="undo-toast" role="status">
		<span>{t('pantry.removedToast', { name: lastRemoved.ingredientName })}</span>
		<button type="button" class="undo-toast__action" onclick={undoRemove}>{t('pantry.undo')}</button>
	</div>
{/if}

<style lang="scss">
	.lede {
		color: var(--text-secondary);
	}
	.add-form {
		display: flex;
		gap: var(--space-2);
		margin: var(--space-4) 0;

		input {
			padding: var(--space-2) var(--space-3);
			border-radius: var(--radius-card);
			border: 1px solid var(--bg-surface-alt);
			font-size: 14px;
			font-family: inherit;
		}
		input[type='text']:first-child {
			flex: 2;
		}
		input[type='number'] {
			flex: 1;
			min-width: 0;
		}
		input[type='text']:not(:first-child) {
			flex: 1;
			min-width: 0;
		}
	}
	.empty {
		color: var(--text-secondary);
	}
	.pantry-list {
		list-style: none;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);

		li {
			display: flex;
			justify-content: space-between;
			align-items: center;
			padding: var(--space-3);
			background: var(--bg-surface);
			border-radius: var(--radius-card);
		}
	}
	.undo-toast {
		position: fixed;
		left: 50%;
		bottom: var(--space-4);
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-pill);
		background: var(--text-primary);
		color: var(--bg-surface);
		font-size: 13px;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
		z-index: 50;
		animation: undo-toast-in 0.15s ease-out;

		@media (prefers-reduced-motion: reduce) {
			animation: none;
		}
	}
	.undo-toast__action {
		background: none;
		border: none;
		color: inherit;
		font-weight: 700;
		font-size: 13px;
		cursor: pointer;
		font-family: inherit;
		text-decoration: underline;
		padding: 0;
	}
	@keyframes undo-toast-in {
		from {
			opacity: 0;
			transform: translate(-50%, 8px);
		}
		to {
			opacity: 1;
			transform: translate(-50%, 0);
		}
	}
</style>
