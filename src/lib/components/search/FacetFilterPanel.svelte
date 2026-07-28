<script lang="ts">
	// One facet group (tags, or dietFlags) — a value pill cycles neutral → include → exclude →
	// neutral (recipeFilter.ts's `cycleFacetValue`), plus an explicit AND/OR toggle governing how
	// the *included* values combine (CLAUDE.md 4.7's own named requirement: AND by default, OR
	// only via a visible toggle, never the other way around). Reused for both facets rather than
	// building two near-identical panels.
	import { t } from '$lib/i18n/t';
	import {
		cycleFacetValue,
		facetValueState,
		type FacetMode,
		type FacetValueState
	} from '$lib/utils/recipeFilter';

	let {
		heading,
		options,
		included,
		excluded,
		mode,
		onChange,
		onModeChange
	}: {
		heading: string;
		options: string[];
		included: string[];
		excluded: string[];
		mode: FacetMode;
		onChange: (next: { included: string[]; excluded: string[] }) => void;
		onModeChange: (mode: FacetMode) => void;
	} = $props();

	function stateOf(value: string): FacetValueState {
		return facetValueState(value, included, excluded);
	}

	function handleClick(value: string) {
		onChange(cycleFacetValue(value, included, excluded));
	}

	function ariaPressed(state: FacetValueState): 'true' | 'false' | 'mixed' {
		if (state === 'include') return 'true';
		if (state === 'exclude') return 'mixed';
		return 'false';
	}
</script>

<fieldset class="facet">
	<legend>{heading}</legend>

	{#if options.length === 0}
		<p class="facet__empty">{t('filters.noOptions')}</p>
	{:else}
		<div class="facet__mode" role="group" aria-label={t('filters.modeLabel')}>
			<span class="facet__mode-label">{t('filters.modeLabel')}:</span>
			<button
				type="button"
				class:active={mode === 'and'}
				aria-pressed={mode === 'and'}
				onclick={() => onModeChange('and')}
			>
				{t('filters.modeAnd')}
			</button>
			<button
				type="button"
				class:active={mode === 'or'}
				aria-pressed={mode === 'or'}
				onclick={() => onModeChange('or')}
			>
				{t('filters.modeOr')}
			</button>
		</div>

		<div class="facet__options">
			{#each options as value (value)}
				{@const state = stateOf(value)}
				<button
					type="button"
					class="facet__pill facet__pill--{state}"
					aria-pressed={ariaPressed(state)}
					onclick={() => handleClick(value)}
				>
					{#if state === 'include'}
						<span class="facet__pill-icon" aria-hidden="true">＋</span>
						<span class="sr-only">{t('filters.stateInclude')}</span>
					{:else if state === 'exclude'}
						<span class="facet__pill-icon" aria-hidden="true">－</span>
						<span class="sr-only">{t('filters.stateExclude')}</span>
					{/if}
					#{value}
				</button>
			{/each}
		</div>
	{/if}
</fieldset>

<style lang="scss">
	.facet {
		border: none;
		padding: 0;
		margin: 0 0 var(--space-3);
	}
	legend {
		font-size: 13px;
		font-weight: 600;
		margin-bottom: var(--space-1);
		padding: 0;
	}
	.facet__empty {
		font-size: 12px;
		color: var(--text-secondary);
		margin: 0;
	}
	.facet__mode {
		display: flex;
		align-items: center;
		gap: 4px;
		margin-bottom: var(--space-2);
	}
	.facet__mode-label {
		font-size: 11px;
		color: var(--text-secondary);
		margin-right: 2px;
	}
	.facet__mode button {
		border: none;
		background: var(--bg-surface-alt);
		color: var(--text-secondary);
		font-family: inherit;
		font-size: 11px;
		padding: 2px 8px;
		border-radius: var(--radius-pill);
		cursor: pointer;

		&.active {
			background: var(--accent);
			color: var(--bg-page);
			font-weight: 600;
		}
	}
	.facet__options {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.facet__pill {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		font-family: inherit;
		font-size: 12px;
		padding: 3px 10px;
		border-radius: var(--radius-pill);
		border: 1px solid var(--bg-surface-alt);
		background: var(--bg-surface-alt);
		color: var(--text-secondary);
		cursor: pointer;

		&--include {
			background: var(--status-success);
			border-color: var(--status-success);
			color: white;
			font-weight: 600;
		}
		&--exclude {
			background: transparent;
			border-color: var(--text-secondary);
			color: var(--text-secondary);
			text-decoration: line-through;
		}
	}
	.facet__pill-icon {
		font-weight: 700;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
	}
</style>
