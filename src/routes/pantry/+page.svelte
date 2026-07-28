<script lang="ts">
	import { pantryStore } from '$lib/state/pantry.svelte';
	import { t } from '$lib/i18n/t';

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
			<button class="btn btn--ghost" onclick={() => pantryStore.markUsed(item.id)}>
				{t('pantry.used')}
			</button>
		</li>
	{/each}
</ul>

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
</style>
