<script lang="ts">
	// The Recipe-First Composer (docs/modules.md 4.2 / FUTURES.md 9.4) — the logged-in Foodia
	// author's path: publishes straight to the feed via POST /api/recipes. The form itself lives in
	// RecipeComposerForm, shared with the /fuw cookbook form since Session 29.
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { authStore } from '$lib/state/auth.svelte';
	import RecipeComposerForm from '$lib/components/recipe/RecipeComposerForm.svelte';
	import { t } from '$lib/i18n/t';
	import type { CreateRecipeInput } from '$lib/types/recipeInput';

	let submitting = $state(false);
	let errorMessage = $state('');

	function publish(input: CreateRecipeInput) {
		errorMessage = '';
		submitting = true;
		fetch('/api/recipes', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(input)
		})
			.then(async (res) => {
				if (!res.ok) throw new Error(await res.text());
				const { id } = await res.json();
				goto(`/recipes/${id}`);
			})
			.catch(() => {
				errorMessage = t('recipeComposer.errorGeneric');
				submitting = false;
			});
	}
</script>


<svelte:head>
	<title>{t('recipeComposer.pageTitle')} — Foodia</title>
</svelte:head>

<h1>{t('recipeComposer.pageTitle')}</h1>

{#if __IS_CAPACITOR__}
	<p class="notice">{t('recipeComposer.noBackend')}</p>
{:else if !authStore.hydrated}
	<!-- Deliberately renders nothing while auth state is still resolving — a real network round
	     trip now (Session 17), not an in-memory lookup, so this window is real, if brief. Showing
	     the login gate here for a split second before the composer form appears would be a false
	     flash, not an honest loading state. -->
{:else if !authStore.isAuthenticated}
	<p class="notice">
		{t('recipeComposer.loginRequired')}
		<a href={`/login?redirectTo=${encodeURIComponent('/recipes/new')}`}>{t('recipeComposer.loginLink')}</a>
	</p>
{:else}
	<RecipeComposerForm
		canUpload={page.data.canUpload === true}
		{submitting}
		{errorMessage}
		submitLabel={t('recipeComposer.publish')}
		submittingLabel={t('recipeComposer.publishing')}
		onSubmit={publish}
	/>
{/if}

<style lang="scss">
	h1 {
		margin-bottom: var(--space-4);
	}
	.notice {
		color: var(--text-secondary);
	}
</style>
