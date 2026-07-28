<script lang="ts">
	import RecipeCard from '$lib/components/recipe/RecipeCard.svelte';
	import { profileStore } from '$lib/state/profile.svelte';
	import { isRecipeCookable } from '$lib/utils/cookability';
	import { t, tPlural } from '$lib/i18n/t';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// The hardware hard-filter (CLAUDE.md 4.1) — client-only, since the profile itself is
	// client-only (no backend session yet, see Section 7's own note on this). Before hydration
	// (and for anyone who never onboarded — the Neutral default) `profile` is null and
	// `isRecipeCookable` passes everything through unfiltered, which is also the *correct*
	// Progressive Profiling behavior, not just an SSR workaround.
	//
	// Session 9 — reconciled with the step-level Device/Equipment Alternatives system (4.9,
	// Section 7 item 26): a recipe is no longer hidden outright just because one step assumes
	// equipment the viewer lacks, when that step actually has a usable alternative technique. See
	// lib/utils/cookability.ts's own doc comment for exactly how recipe-level-only equipment
	// (e.g. overnightOats' kitchenScale, not attributable to any single step) stays a hard block.
	let hardware = $derived(profileStore.profile?.hardware ?? null);
	let visibleRecipes = $derived(data.recipes.filter((r) => isRecipeCookable(r, hardware)));
	let hiddenCount = $derived(data.recipes.length - visibleRecipes.length);
</script>

<svelte:head>
	<title>{t('home.title')} — Foodia</title>
</svelte:head>

<h1>{t('home.title')}</h1>
<p class="lede">{t('home.lede')}</p>

{#if profileStore.hydrated && !profileStore.hasOnboarded}
	<a href="/onboarding" class="nudge">{t('home.nudge')}</a>
{/if}

{#if hiddenCount > 0}
	<p class="hidden-note">
		{tPlural('home.hiddenNote', hiddenCount)}
		— <a href="/onboarding">{t('home.changeThis')}</a>.
	</p>
{/if}

<div class="grid">
	{#each visibleRecipes as recipe (recipe.id)}
		<RecipeCard {recipe} />
	{/each}
</div>

{#if profileStore.hydrated && visibleRecipes.length === 0}
	<p class="empty">
		{t('home.empty')} <a href="/onboarding">{t('home.updateProfile')}</a>?
	</p>
{/if}

<style lang="scss">
	.lede {
		color: var(--text-secondary);
		margin-top: 0;
	}
	.nudge {
		display: block;
		margin-bottom: var(--space-4);
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-card);
		background: var(--accent-soft);
		color: var(--text-primary);
		text-decoration: none;
		font-weight: 600;
	}
	.hidden-note {
		font-size: 13px;
		color: var(--text-secondary);
		margin-bottom: var(--space-3);

		a {
			color: var(--accent);
		}
	}
	.empty {
		color: var(--text-secondary);
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		gap: var(--space-4);
	}
</style>
