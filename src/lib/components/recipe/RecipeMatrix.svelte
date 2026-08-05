<script lang="ts">
	// The default view at the top of every recipe: the tabular layout from the reference guide
	// ("i can't believe someone solved recipe design decades ago and everyone just decided to
	// ignore it" — Cooking for Engineers, 2006). Ingredients down the left, each operation as one
	// merged cell bracketing every row it consumes, so the SHAPE of the dish is legible in a glance:
	// what goes in with what, and in what order things stop being separate things.
	//
	// Purely presentational — every decision about which cell goes where lives in
	// `lib/utils/recipeMatrix.ts` (pure, no Svelte import, verified directly by
	// `scripts/verify-recipe-matrix.ts`), the same split `ProductionPathway`-style dumb components
	// use elsewhere. This file owns the borders and the tap targets, nothing about the algorithm.
	import { layoutRecipeMatrix, type RecipeMatrix } from '$lib/utils/recipeMatrix';
	import type { Ingredient } from '$lib/types/recipe';
	import type { PantryCoverage } from '$lib/utils/pantryStatus';
	import { t } from '$lib/i18n/t';

	let {
		matrix,
		displayFor,
		coverageFor = () => null,
		noteCountFor = () => 0,
		onselect
	}: {
		matrix: RecipeMatrix;
		/** Swap-aware row text — the page owns which substitution is currently chosen, so it hands
		 *  down the line to print rather than this component re-deriving it and risking disagreeing
		 *  with the ingredient list further down the same page. */
		displayFor: (ingredient: Ingredient) => { text: string; swapped: boolean };
		/** null when the pantry hasn't hydrated yet (or the cook keeps none) — deliberately distinct
		 *  from `'none'`, so an un-hydrated pantry never renders as "you have nothing". */
		coverageFor?: (ingredient: Ingredient) => PantryCoverage | null;
		noteCountFor?: (ingredient: Ingredient) => number;
		onselect: (ingredient: Ingredient) => void;
	} = $props();

	let layout = $derived(layoutRecipeMatrix(matrix));

	// Which operation's full sentence is showing. The cells are terse on purpose (that's the whole
	// point of the layout); the full text is one tap away rather than gone.
	let expandedStepId = $state<string | null>(null);
	let expandedStep = $derived(
		expandedStepId
			? (layout.cells.find((c) => c.kind === 'op' && c.step?.id === expandedStepId)?.step ?? null)
			: null
	);

	const COVERAGE_ICON: Record<PantryCoverage, string> = {
		enough: '✓',
		partial: '◐',
		none: '',
		unresolved: '?'
	};

	/** A switch rather than an interpolated `t(\`matrix.pantry.${coverage}\`)` — `MessageKey` is a
	 *  union of real literals, and casting a template string into it would defeat the one guarantee
	 *  messages.ts's own `satisfies` check exists to give (a missing translation is a build error,
	 *  never a raw key rendered at runtime). */
	function coverageLabel(coverage: PantryCoverage): string {
		switch (coverage) {
			case 'enough':
				return t('matrix.pantryEnough');
			case 'partial':
				return t('matrix.pantryPartial');
			case 'unresolved':
				return t('matrix.pantryUnresolved');
			default:
				return t('matrix.pantryNone');
		}
	}
</script>

<div class="matrix">
	{#each matrix.prepSteps as step (step.id)}
		<!-- Leading steps that name no ingredient — "butter and flour the pan", "preheat the oven".
		     Banner rows above the table in the reference layout, and rightly so: they're setup, not
		     an operation performed on any ingredient row. -->
		<p class="matrix__prep">
			{step.text}
			{#if step.durationMinutes}
				<span class="matrix__duration">⏲ {step.durationMinutes} min</span>
			{/if}
		</p>
	{/each}

	{#if layout.rowCount > 0}
		<div class="matrix__scroll">
			<div
				class="matrix__grid"
				style="grid-template-columns: minmax(170px, 1.4fr) repeat({Math.max(
					0,
					layout.columnCount - 1
				)}, minmax(76px, 0.55fr));"
				aria-label={t('matrix.ariaLabel')}
			>
				{#each layout.cells as cell, index (cell.kind + index)}
					{#if cell.kind === 'ingredient' && cell.ingredient}
						{@const ingredient = cell.ingredient}
						{@const display = displayFor(ingredient)}
						{@const coverage = coverageFor(ingredient)}
						{@const notes = noteCountFor(ingredient)}
						<button
							type="button"
							class="cell cell--ingredient"
							class:swapped={display.swapped}
							style="grid-row: {cell.rowStart} / {cell.rowEnd}; grid-column: {cell.colStart} / {cell.colEnd};"
							onclick={() => onselect(ingredient)}
						>
							<span class="cell__text">{display.text}</span>
							<span class="cell__marks">
								{#if notes > 0}
									<span class="mark mark--notes" title={t('matrix.notesTitle', { n: notes })}>
										💬{notes}
									</span>
								{/if}
								{#if coverage && coverage !== 'none'}
									<!-- The pantry answer, on the row itself: the single most common reason to look
									     at an ingredient list at all is "do I need to buy this". `unresolved` shows
									     a question mark rather than a tick — see pantryStatus.ts on why "I can't
									     tell" must never render as either yes or no. -->
									<span
										class="mark mark--pantry mark--{coverage}"
										title={coverageLabel(coverage)}
									>
										{COVERAGE_ICON[coverage]}
									</span>
								{/if}
							</span>
						</button>
					{:else if cell.kind === 'op' && cell.step}
						{@const step = cell.step}
						<button
							type="button"
							class="cell cell--op"
							class:expanded={expandedStepId === step.id}
							style="grid-row: {cell.rowStart} / {cell.rowEnd}; grid-column: {cell.colStart} / {cell.colEnd};"
							title={step.text}
							aria-expanded={expandedStepId === step.id}
							onclick={() => (expandedStepId = expandedStepId === step.id ? null : step.id)}
						>
							<span class="cell__op-label">{cell.label}</span>
							{#if step.durationMinutes}
								<span class="cell__op-time">{step.durationMinutes} min</span>
							{/if}
						</button>
					{:else}
						<div
							class="cell cell--filler"
							style="grid-row: {cell.rowStart} / {cell.rowEnd}; grid-column: {cell.colStart} / {cell.colEnd};"
						></div>
					{/if}
				{/each}
			</div>
		</div>

		{#if expandedStep}
			<p class="matrix__detail">
				<strong>{t('matrix.stepLabel', { n: expandedStep.order })}</strong>
				{expandedStep.text}
			</p>
		{/if}

		{#if matrix.unusedIngredients.length > 0}
			<!-- Said out loud rather than hidden: these ingredients are listed but no step ever names
			     them, which is a real authoring gap in the recipe, not a rendering quirk. -->
			<p class="matrix__note">{t('matrix.unusedNote', { n: matrix.unusedIngredients.length })}</p>
		{/if}

		<p class="matrix__hint">{t('matrix.hint')}</p>
	{/if}
</div>

<style lang="scss">
	.matrix {
		margin-bottom: var(--space-5);
	}
	.matrix__prep {
		margin: 0 0 -1px;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--matrix-line);
		background: var(--bg-surface);
		font-size: 13px;
		text-align: center;
		display: flex;
		justify-content: center;
		align-items: center;
		gap: var(--space-2);
	}
	.matrix__duration {
		font-size: 11px;
		color: var(--text-secondary);
	}
	// A deep chain on a narrow phone is genuinely wider than the screen; scrolling it sideways is
	// the honest answer, and far better than shrinking the type until nobody can read the pan size.
	.matrix__scroll {
		overflow-x: auto;
	}
	.matrix__grid {
		display: grid;
		// Every cell draws its own right and bottom edge; the container draws the two the cells
		// can't reach. The root operation always spans the last column AND the last row, so the box
		// closes itself without any cell needing to know it's last.
		border-top: 1px solid var(--matrix-line);
		border-left: 1px solid var(--matrix-line);
		min-width: 100%;
		width: max-content;
	}
	.cell {
		border-right: 1px solid var(--matrix-line);
		border-bottom: 1px solid var(--matrix-line);
		background: none;
		font-family: inherit;
		color: inherit;
		margin: 0;
		text-align: left;
	}
	.cell--ingredient {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		font-size: 13px;
		cursor: pointer;
		width: 100%;

		&:hover,
		&:focus-visible {
			background: var(--accent-soft);
		}
		&.swapped .cell__text {
			color: var(--accent);
			font-weight: 600;
		}
	}
	.cell__text {
		line-height: 1.35;
	}
	.cell__marks {
		display: flex;
		align-items: center;
		gap: 4px;
		flex-shrink: 0;
	}
	.mark {
		font-size: 11px;
		color: var(--text-secondary);
	}
	.mark--pantry {
		font-weight: 700;
	}
	.mark--enough {
		color: var(--status-success);
	}
	.mark--partial,
	.mark--unresolved {
		color: var(--status-warning);
	}
	.cell--op {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		padding: var(--space-2);
		font-size: 12px;
		text-align: center;
		cursor: pointer;
		hyphens: auto;

		&:hover,
		&:focus-visible,
		&.expanded {
			background: var(--accent-soft);
		}
	}
	.cell__op-label {
		line-height: 1.3;
	}
	.cell__op-time {
		font-size: 10px;
		color: var(--text-secondary);
	}
	.cell--filler {
		// Intentionally empty — its whole job is to draw the two lines that bound the area under a
		// finished operation. See layoutRecipeMatrix's own note on why these are real cells.
		min-height: 100%;
	}
	.matrix__detail {
		margin: var(--space-2) 0 0;
		padding: var(--space-2) var(--space-3);
		background: var(--bg-surface-alt);
		border-radius: var(--radius-card);
		font-size: 13px;
	}
	.matrix__note,
	.matrix__hint {
		margin: var(--space-2) 0 0;
		font-size: 12px;
		color: var(--text-secondary);
	}
</style>
