<script lang="ts">
	import RecipeCard from '$lib/components/recipe/RecipeCard.svelte';
	import FacetFilterPanel from '$lib/components/search/FacetFilterPanel.svelte';
	import IngredientSearchPanel from '$lib/components/search/IngredientSearchPanel.svelte';
	import { profileStore } from '$lib/state/profile.svelte';
	import { uiLocaleStore } from '$lib/state/uiLocale.svelte';
	import { isRecipeCookable } from '$lib/utils/cookability';
	import { filterByUiLocale } from '$lib/utils/recipeLocale';
	import {
		emptyRecipeFilters,
		filterRecipes,
		distinctValues,
		hasActiveFilters,
		activeFilterCount,
		distinctIngredientNames,
		type FacetMode
	} from '$lib/utils/recipeFilter';
	import { t, tPlural } from '$lib/i18n/t';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Session 24 — "when English is active, show only English recipes": the interface language
	// IS the recipe-language filter here, applied first, ahead of every other narrowing below (so
	// facet options never offer a tag that only exists on a recipe in the other language).
	let localeRecipes = $derived(filterByUiLocale(data.recipes, uiLocaleStore.locale));

	// Search, Filtering & Categorization (CLAUDE.md 4.7) — page-local $state, same "no new data
	// model, purely session-local UI state" treatment `/plan`'s own local drafts already get.
	// Options are derived from the locale-filtered corpus (not narrowed by the hardware filter or
	// by each other) — a simpler, "options never shrink beyond the language filter" choice, same
	// one 2do's own facet pickers make for their own unfiltered base.
	let filters = $state(emptyRecipeFilters());
	let tagOptions = $derived(distinctValues(localeRecipes, 'tags'));
	let dietFlagOptions = $derived(distinctValues(localeRecipes, 'dietFlags'));
	// Ingredient search (Session 27) works here for free because this page already loads full
	// RecipeDetails rather than thin Cards — see +page.server.ts's own note on why (the equipment
	// cookability check needed them first). A page that only had Cards could not offer this.
	let ingredientOptions = $derived(distinctIngredientNames(localeRecipes));

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
	let cookableRecipes = $derived(localeRecipes.filter((r) => isRecipeCookable(r, hardware)));
	let hiddenCount = $derived(localeRecipes.length - cookableRecipes.length);
	// The facet filters narrow further, applied AFTER the hardware hard-filter — a recipe hidden
	// for lacking equipment stays hidden regardless of what's selected here.
	let visibleRecipes = $derived(filterRecipes(cookableRecipes, filters));
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

<details class="filters">
	<summary>
		{t('filters.toggle')}
		{#if hasActiveFilters(filters)}
			<span class="filters__badge">{tPlural('filters.activeCount', activeFilterCount(filters))}</span>
		{/if}
	</summary>
	<div class="filters__body">
		<!-- First, because it's the filter people actually arrive with a question about ("what can I
		     make with what's in the fridge") — tags and diet flags narrow a browse, this starts one. -->
		<IngredientSearchPanel
			allNames={ingredientOptions}
			included={filters.ingredients}
			excluded={filters.ingredientsExclude}
			mode={filters.ingredientsMode}
			onChange={(next) =>
				(filters = { ...filters, ingredients: next.included, ingredientsExclude: next.excluded })}
			onModeChange={(mode: FacetMode) => (filters = { ...filters, ingredientsMode: mode })}
		/>
		<FacetFilterPanel
			heading={t('filters.tagsHeading')}
			options={tagOptions}
			included={filters.tags}
			excluded={filters.tagsExclude}
			mode={filters.tagsMode}
			onChange={(next) => (filters = { ...filters, tags: next.included, tagsExclude: next.excluded })}
			onModeChange={(mode: FacetMode) => (filters = { ...filters, tagsMode: mode })}
		/>
		<FacetFilterPanel
			heading={t('filters.dietFlagsHeading')}
			options={dietFlagOptions}
			included={filters.dietFlags}
			excluded={filters.dietFlagsExclude}
			mode={filters.dietFlagsMode}
			onChange={(next) =>
				(filters = { ...filters, dietFlags: next.included, dietFlagsExclude: next.excluded })}
			onModeChange={(mode: FacetMode) => (filters = { ...filters, dietFlagsMode: mode })}
		/>
		{#if hasActiveFilters(filters)}
			<button type="button" class="filters__clear" onclick={() => (filters = emptyRecipeFilters())}>
				{t('filters.clear')}
			</button>
		{/if}
	</div>
</details>

<div class="grid">
	{#each visibleRecipes as recipe (recipe.id)}
		<RecipeCard {recipe} />
	{/each}
</div>

{#if cookableRecipes.length > 0 && visibleRecipes.length === 0}
	<p class="empty">
		{t('filters.noMatches')}
		<button type="button" class="filters__clear filters__clear--inline" onclick={() => (filters = emptyRecipeFilters())}>
			{t('filters.clear')}
		</button>
	</p>
{/if}

{#if profileStore.hydrated && cookableRecipes.length === 0}
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
	.filters {
		margin-bottom: var(--space-4);
		background: var(--bg-surface);
		border-radius: var(--radius-card);
		padding: var(--space-2) var(--space-3);
	}
	.filters summary {
		cursor: pointer;
		font-weight: 600;
		font-size: 14px;
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.filters__badge {
		font-size: 11px;
		font-weight: 600;
		padding: 2px 8px;
		border-radius: var(--radius-pill);
		background: var(--accent);
		color: var(--bg-page);
	}
	.filters__body {
		margin-top: var(--space-3);
	}
	.filters__clear {
		border: none;
		background: var(--bg-surface-alt);
		color: var(--text-secondary);
		font-family: inherit;
		font-size: 12px;
		padding: 4px 12px;
		border-radius: var(--radius-pill);
		cursor: pointer;

		&--inline {
			margin-left: var(--space-2);
		}
	}
</style>
