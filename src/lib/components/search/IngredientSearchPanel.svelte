<script lang="ts">
	// Search by ingredient. Deliberately NOT another `FacetFilterPanel`: that component renders a
	// closed list of every value in the corpus as pills, which is right for a dozen tags and wrong
	// for a hundred-plus ingredient names — and it can only ever select values that already exist,
	// whereas "garlic" must find "Czosnek granulowany" without being either of the two names in the
	// corpus. So this is a typed query with suggestions, producing free-text TERMS.
	//
	// Everything else is deliberately identical to the other facets: AND by default with a visible
	// OR toggle, and real click-driven exclusion — the lesson recipeFilter.ts's own header records.
	import { pantryStore } from '$lib/state/pantry.svelte';
	import { suggestIngredientNames, type FacetMode } from '$lib/utils/recipeFilter';
	import { t } from '$lib/i18n/t';

	let {
		allNames,
		included,
		excluded,
		mode,
		onChange,
		onModeChange
	}: {
		allNames: string[];
		included: string[];
		excluded: string[];
		mode: FacetMode;
		onChange: (next: { included: string[]; excluded: string[] }) => void;
		onModeChange: (mode: FacetMode) => void;
	} = $props();

	let query = $state('');
	let suggestions = $derived(suggestIngredientNames(allNames, query, [...included, ...excluded]));

	function addTerm(term: string) {
		const trimmed = term.trim();
		if (!trimmed) return;
		const lower = trimmed.toLowerCase();
		if ([...included, ...excluded].some((v) => v.toLowerCase() === lower)) return;
		onChange({ included: [...included, trimmed], excluded });
		query = '';
	}

	/** Include ⇄ exclude on the chip itself. There's no third "neutral" state to cycle through the
	 *  way a fixed-vocabulary pill has, because a term only exists here BECAUSE it was typed —
	 *  neutral is what the ✕ is for. */
	function toggleTerm(term: string) {
		if (included.includes(term)) {
			onChange({ included: included.filter((v) => v !== term), excluded: [...excluded, term] });
		} else {
			onChange({ included: [...included, term], excluded: excluded.filter((v) => v !== term) });
		}
	}

	function removeTerm(term: string) {
		onChange({
			included: included.filter((v) => v !== term),
			excluded: excluded.filter((v) => v !== term)
		});
	}

	/**
	 * "What can I make from what I already have." Adds every pantry row's name as a term AND flips
	 * the facet to OR — with AND it would ask for a recipe using every single thing in the pantry,
	 * which is almost never a real dish and would reliably return nothing. Switching the mode is
	 * therefore part of the action, not a separate step the cook is left to work out.
	 */
	function fillFromPantry() {
		const names = pantryStore.items.map((i) => i.ingredientName.trim()).filter(Boolean);
		const existing = new Set([...included, ...excluded].map((v) => v.toLowerCase()));
		const fresh = names.filter((n) => !existing.has(n.toLowerCase()));
		if (fresh.length === 0) return;
		onModeChange('or');
		onChange({ included: [...included, ...fresh], excluded });
	}
</script>

<fieldset class="facet">
	<legend>{t('filters.ingredientsHeading')}</legend>

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

	<div class="search">
		<input
			type="search"
			bind:value={query}
			placeholder={t('filters.ingredientSearchPlaceholder')}
			aria-label={t('filters.ingredientSearchLabel')}
			onkeydown={(e) => {
				if (e.key === 'Enter') {
					e.preventDefault();
					// Enter commits whatever was typed, not the top suggestion: a cook typing "mięso"
					// means "anything with mięso in it", and a substring term matches more than the one
					// name that happens to sort first.
					addTerm(query);
				}
			}}
		/>
		{#if pantryStore.hydrated && pantryStore.items.length > 0}
			<button type="button" class="from-pantry" onclick={fillFromPantry}>
				{t('filters.ingredientFromPantry')}
			</button>
		{/if}
	</div>

	{#if query.trim()}
		<div class="suggestions">
			{#each suggestions as name (name)}
				<button type="button" class="suggestion" onclick={() => addTerm(name)}>{name}</button>
			{/each}
			<button type="button" class="suggestion suggestion--raw" onclick={() => addTerm(query)}>
				{t('filters.ingredientAdd', { term: query.trim() })}
			</button>
		</div>
	{/if}

	{#if included.length > 0 || excluded.length > 0}
		<div class="terms">
			{#each [...included, ...excluded] as term (term)}
				{@const isExcluded = excluded.includes(term)}
				<span class="term" class:excluded={isExcluded}>
					<button
						type="button"
						class="term__toggle"
						aria-pressed={!isExcluded}
						title={isExcluded ? t('filters.stateExclude') : t('filters.stateInclude')}
						onclick={() => toggleTerm(term)}
					>
						{isExcluded ? '－' : '＋'}
						{term}
					</button>
					<button
						type="button"
						class="term__remove"
						aria-label={t('filters.ingredientRemove', { term })}
						onclick={() => removeTerm(term)}
					>
						✕
					</button>
				</span>
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
	.search {
		display: flex;
		gap: var(--space-2);
		align-items: center;
		flex-wrap: wrap;

		input {
			flex: 1;
			min-width: 160px;
			padding: var(--space-2);
			border: 1px solid var(--bg-surface-alt);
			border-radius: var(--radius-card);
			font-family: inherit;
			font-size: 13px;
			color: var(--text-primary);
		}
	}
	.from-pantry {
		border: 1px solid var(--bg-surface-alt);
		background: var(--bg-surface-alt);
		color: var(--text-secondary);
		font-family: inherit;
		font-size: 12px;
		padding: 4px 10px;
		border-radius: var(--radius-pill);
		cursor: pointer;

		&:hover {
			border-color: var(--accent);
			color: var(--accent);
		}
	}
	.suggestions {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: var(--space-2);
	}
	.suggestion {
		border: 1px solid var(--bg-surface-alt);
		background: var(--bg-surface);
		font-family: inherit;
		font-size: 12px;
		padding: 3px 10px;
		border-radius: var(--radius-pill);
		cursor: pointer;
		color: var(--text-primary);

		&:hover {
			border-color: var(--accent);
		}
		&--raw {
			font-style: italic;
			color: var(--text-secondary);
		}
	}
	.terms {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: var(--space-2);
	}
	.term {
		display: inline-flex;
		align-items: center;
		border-radius: var(--radius-pill);
		background: var(--status-success);
		color: white;
		font-size: 12px;
		font-weight: 600;
		padding-right: 6px;

		&.excluded {
			background: transparent;
			border: 1px solid var(--text-secondary);
			color: var(--text-secondary);
			text-decoration: line-through;
		}
	}
	.term__toggle,
	.term__remove {
		background: none;
		border: none;
		color: inherit;
		font-family: inherit;
		font-size: inherit;
		font-weight: inherit;
		cursor: pointer;
		padding: 3px 4px 3px 10px;
	}
	.term__remove {
		padding: 3px 2px;
		opacity: 0.8;

		&:hover {
			opacity: 1;
		}
	}
</style>
