<script lang="ts">
	// "How is this usually measured?" — asked once per ingredient, cached forever
	// (`ingredientDensityStore`), and the ONLY honest way this app bridges a cup to a gram: see
	// lib/types/units.ts's own header for why an invented per-ingredient density would be worse
	// than not converting at all.
	//
	// Extracted from /shopping-list (Session 27) the moment the ingredient sheet needed to ask the
	// same question. Two copies of a question whose whole value is that it's asked exactly once
	// would have been the wrong shape: they'd drift, and a cook answering in one place must be
	// answering in the other, which they now provably are — same component, same store, same key.
	import { ingredientDensityStore } from '$lib/state/ingredientDensity.svelte';
	import { t } from '$lib/i18n/t';
	import type { MessageKey } from '$lib/i18n/messages';
	import type { DensityClass } from '$lib/types/units';

	let { ingredientName }: { ingredientName: string } = $props();

	const DENSITY_CLASSES: { key: DensityClass; labelKey: string; exampleKey: string }[] = [
		{ key: 'powdery', labelKey: 'shopping.density.powdery', exampleKey: 'shopping.density.powderyExample' },
		{ key: 'granular', labelKey: 'shopping.density.granular', exampleKey: 'shopping.density.granularExample' },
		{ key: 'liquid', labelKey: 'shopping.density.liquid', exampleKey: 'shopping.density.liquidExample' },
		{ key: 'light', labelKey: 'shopping.density.light', exampleKey: 'shopping.density.lightExample' },
		{ key: 'dense', labelKey: 'shopping.density.dense', exampleKey: 'shopping.density.denseExample' }
	];
</script>

<div class="density-prompt">
	<span class="density-prompt__question">
		{t('shopping.densityQuestion', { name: ingredientName })}
	</span>
	<div class="density-prompt__options">
		{#each DENSITY_CLASSES as dc (dc.key)}
			<button
				type="button"
				class="density-prompt__option"
				onclick={() => ingredientDensityStore.classify(ingredientName, dc.key)}
			>
				{t(dc.labelKey as MessageKey)}
				<span class="density-prompt__example">{t(dc.exampleKey as MessageKey)}</span>
			</button>
		{/each}
	</div>
</div>

<style lang="scss">
	.density-prompt {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-card);
		background: var(--bg-surface-alt);
		font-size: 13px;
	}
	.density-prompt__question {
		color: var(--text-secondary);
	}
	.density-prompt__options {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.density-prompt__option {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 2px;
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius-card);
		border: 1px solid var(--bg-surface);
		background: var(--bg-surface);
		cursor: pointer;
		font-family: inherit;
		font-size: 12px;
		font-weight: 600;
		color: var(--text-primary);

		&:hover {
			border-color: var(--accent);
			color: var(--accent);
		}
	}
	.density-prompt__example {
		font-size: 11px;
		font-weight: 400;
		color: var(--text-secondary);
	}
</style>
