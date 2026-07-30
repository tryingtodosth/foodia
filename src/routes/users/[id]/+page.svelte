<script lang="ts">
	import RecipeCard from '$lib/components/recipe/RecipeCard.svelte';
	import { t } from '$lib/i18n/t';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let user = $derived(data.user);
	let recipes = $derived(data.recipes);
</script>

<svelte:head>
	<title>{user.displayName} — Foodia</title>
</svelte:head>

<div class="header">
	<div class="avatar" aria-hidden="true">{user.displayName.charAt(0).toUpperCase()}</div>
	<div>
		<h1>{user.displayName}</h1>
		{#if user.isModerator}
			<span class="moderator-badge">🛡 {t('userProfile.moderatorBadge')}</span>
		{/if}
	</div>
</div>

<section>
	<h2>{t('userProfile.recipesHeading', { n: recipes.length })}</h2>
	{#if recipes.length > 0}
		<div class="grid">
			{#each recipes as recipe (recipe.id)}
				<RecipeCard {recipe} />
			{/each}
		</div>
	{:else}
		<p class="empty">{t('userProfile.noRecipes')}</p>
	{/if}
</section>

<style lang="scss">
	.header {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin-bottom: var(--space-5);
	}
	.avatar {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 56px;
		height: 56px;
		border-radius: 50%;
		background: var(--accent);
		color: white;
		font-size: 22px;
		font-weight: 600;
		flex-shrink: 0;
	}
	h1 {
		margin: 0;
	}
	.moderator-badge {
		display: inline-block;
		margin-top: var(--space-1);
		padding: 2px 10px;
		border-radius: var(--radius-pill);
		background: var(--bg-surface-alt);
		font-size: 12px;
		color: var(--text-secondary);
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		gap: var(--space-4);
	}
	.empty {
		color: var(--text-secondary);
	}
</style>
