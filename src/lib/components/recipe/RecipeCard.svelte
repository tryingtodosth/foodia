<script lang="ts">
	import type { RecipeCard } from '$lib/types/recipe';
	import { profileStore } from '$lib/state/profile.svelte';
	import { equipmentMatchLabel } from '$lib/utils/hardware';

	let { recipe }: { recipe: RecipeCard } = $props();

	let matchLabel = $derived(
		equipmentMatchLabel(recipe.requiredEquipment, profileStore.profile?.hardware ?? null)
	);
</script>

<a class="card" href={`/recipes/${recipe.id}`}>
	<div class="card__hero" aria-hidden="true"></div>
	<div class="card__body">
		<h3 class="card__title">{recipe.name}</h3>
		<p class="card__summary">{recipe.summary}</p>
		<div class="card__meta">
			<span>⏱ {recipe.timeMinutes} min</span>
			<span>🔥 {recipe.macros.kcal} kcal</span>
			{#if recipe.costEstimate}
				<span>💸 {recipe.costEstimate.amount} {recipe.costEstimate.currency}</span>
			{/if}
		</div>
		{#if recipe.tags.length}
			<div class="card__tags">
				{#each recipe.tags as tag (tag)}
					<span class="card__tag">#{tag}</span>
				{/each}
			</div>
		{/if}
		{#if matchLabel}
			<p class="card__match">✓ {matchLabel}</p>
		{/if}
	</div>
</a>

<style lang="scss">
	.card {
		display: block;
		background: var(--bg-surface);
		border-radius: var(--radius-card);
		overflow: hidden;
		text-decoration: none;
		color: var(--text-primary);
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
		transition: transform 0.15s ease;

		&:hover {
			transform: translateY(-2px);
		}
	}
	.card__hero {
		height: 120px;
		background: linear-gradient(135deg, var(--accent-soft), var(--accent));
	}
	.card__body {
		padding: var(--space-3);
	}
	.card__title {
		margin: 0 0 var(--space-1);
		font-size: 16px;
	}
	.card__summary {
		margin: 0 0 var(--space-2);
		font-size: 13px;
		color: var(--text-secondary);
	}
	.card__meta {
		display: flex;
		gap: var(--space-3);
		font-size: 12px;
		color: var(--text-secondary);
	}
	.card__tags {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
		margin-top: var(--space-2);
	}
	.card__tag {
		font-size: 11px;
		padding: 2px 8px;
		border-radius: var(--radius-pill);
		background: var(--bg-surface-alt);
		color: var(--text-secondary);
	}
	.card__match {
		margin: var(--space-2) 0 0;
		font-size: 12px;
		font-weight: 600;
		color: var(--status-success);
	}
</style>
