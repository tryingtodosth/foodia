<script lang="ts">
	import {
		recomputeMacros,
		sortSubstitutionsByReaction,
		filterSafeSubstitutions
	} from '$lib/utils/substitution';
	import { substitutionModerationStore } from '$lib/state/substitutionModeration.svelte';
	import {
		stepNeedsAlternative,
		sortAlternativesByReaction,
		missingEquipmentLabel
	} from '$lib/utils/stepAlternative';
	import { currentUserRef, profileStore } from '$lib/state/profile.svelte';
	import { sessionStepAlternativesStore } from '$lib/state/stepAlternatives.svelte';
	import { uiLocaleStore } from '$lib/state/uiLocale.svelte';
	import ReactionButtons from '$lib/components/comments/ReactionButtons.svelte';
	import CommentItem from '$lib/components/comments/CommentItem.svelte';
	import CommentComposer from '$lib/components/comments/CommentComposer.svelte';
	import TranslationBadge from '$lib/components/recipe/TranslationBadge.svelte';
	import SuggestTranslationModal from '$lib/components/recipe/SuggestTranslationModal.svelte';
	import SubstitutionComposer from '$lib/components/recipe/SubstitutionComposer.svelte';
	import StepAlternativeComposer from '$lib/components/recipe/StepAlternativeComposer.svelte';
	import { resolveRecipeVersion, getRecipeVersions } from '$lib/utils/translations';
	import { t } from '$lib/i18n/t';
	import type { NodeComment, NodeType, Translation, Substitution, StepAlternative } from '$lib/types/recipe';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let recipe = $derived(data.recipe);

	let hardware = $derived(profileStore.profile?.hardware ?? null);
	let allergies = $derived(profileStore.profile?.diet.allergies ?? []);

	// ingredientId -> chosen substitutionId. Local, session-only — no backend to persist to yet.
	let chosenSubstitutions = $state<Record<string, string>>({});
	// stepId -> chosen StepAlternative id, or 'original' to explicitly pin the base technique even
	// when an alternative would otherwise apply. Mirrors chosenSubstitutions' own shape/lifecycle.
	let chosenStepAlternatives = $state<Record<string, string>>({});

	// Community-proposed ingredient substitutions this session (CLAUDE.md 4.2) — same "addedX,
	// merged with the loaded fixture, never mutating it" pattern every other write-side feature in
	// this app already uses. Still page-local/reset-per-recipe-view — ingredient substitutions
	// aren't read anywhere on /recipes/[id]/cook today (Cooking Mode doesn't render ingredients at
	// all yet, see 4.3's own "hybrid inline instructions" gap), so there's nothing for this one to
	// carry over into yet, unlike StepAlternatives below.
	let sessionSubstitutions = $state<Substitution[]>([]);
	$effect(() => {
		recipe.id;
		sessionSubstitutions = [];
		chosenSubstitutions = {};
		chosenStepAlternatives = {};
	});

	// Community-proposed step alternatives (CLAUDE.md 4.9) — deliberately NOT page-local $state.
	// Session 10 moved this into `sessionStepAlternativesStore` (Section 7 item 27): a technique
	// proposed here needs to still be visible — and auto-suggestable — the moment the same cook
	// navigates into this same recipe's /recipes/[id]/cook, which a per-page `$state` reset on
	// mount could never do. The store is keyed by recipe id and simply never needs resetting here;
	// `alternativesFor` below reads straight through it.

	/**
	 * Every substitution for one ingredient — fixture-loaded plus this session's own proposals —
	 * filtered through the allergy hard guardrail (CLAUDE.md 4.1/Section 7 item 2: "structurally
	 * incapable of proposing a swap that violates a declared allergy," never a suggestion the UI is
	 * merely asked to respect). This is the ONE place that filter is applied — both the swap picker
	 * below and `recomputeMacros`'s own `extraSubstitutions` list read through this function, so a
	 * filtered-out substitution can never be chosen, voted on, or silently affect macros either.
	 */
	function substitutionsFor(ingredientId: string): Substitution[] {
		const base = recipe.ingredients.find((i) => i.id === ingredientId)?.substitutions ?? [];
		const extra = sessionSubstitutions.filter((s) => s.forIngredientId === ingredientId);
		return filterSafeSubstitutions([...base, ...extra], allergies);
	}

	/** Every visible substitution across the whole recipe, safety-filtered — see `substitutionsFor`. */
	let safeExtraSubstitutions = $derived(
		filterSafeSubstitutions(sessionSubstitutions, allergies)
	);

	let activeMacros = $derived(recomputeMacros(recipe, chosenSubstitutions, safeExtraSubstitutions));

	function proposeSubstitution(ingredientId: string, name: string, ratio: number) {
		sessionSubstitutions = [
			...sessionSubstitutions,
			{
				id: crypto.randomUUID(),
				forIngredientId: ingredientId,
				name,
				ratio,
				source: 'community',
				proposedBy: currentUserRef()
			}
		];
	}

	/**
	 * Every alternative technique for one step — fixture-loaded plus this session's own proposals,
	 * now read from the cross-route `sessionStepAlternativesStore` (Section 7 item 27) rather than
	 * page-local state, so a proposal made here is still here after navigating to Cooking Mode.
	 */
	function alternativesFor(stepId: string): StepAlternative[] {
		const base = recipe.steps.find((s) => s.id === stepId)?.alternatives ?? [];
		const extra = sessionStepAlternativesStore.forRecipe(recipe.id).filter((a) => a.forStepId === stepId);
		return [...base, ...extra];
	}

	function proposeStepAlternative(
		stepId: string,
		text: string,
		requiresEquipment: string[],
		durationMinutes: number | null
	) {
		sessionStepAlternativesStore.propose(recipe.id, {
			id: crypto.randomUUID(),
			forStepId: stepId,
			text,
			requiresEquipment: requiresEquipment.length > 0 ? requiresEquipment : undefined,
			durationMinutes: durationMinutes ?? undefined,
			source: 'community',
			proposedBy: currentUserRef()
		});
	}

	function chooseStepAlternative(stepId: string, altId: string | null) {
		chosenStepAlternatives = { ...chosenStepAlternatives };
		if (altId) {
			chosenStepAlternatives[stepId] = altId;
		} else {
			delete chosenStepAlternatives[stepId];
		}
	}

	// Content translation (as opposed to lib/i18n/, the interface's own language) — session-only
	// submissions layered on top of whatever the mock fixture already carries, reset per recipe.
	// `versionKey` is an explicit picker choice (null = "follow the interface language"); both
	// reset together whenever the viewed recipe changes.
	let sessionTranslations = $state<Translation[]>([]);
	let versionKey = $state<string | null>(null);
	let showTranslateModal = $state(false);
	$effect(() => {
		recipe.id;
		sessionTranslations = [];
		versionKey = null;
	});

	// The current UI language IS the content-language hierarchy here — a single-entry preference,
	// not a separate ranked settings list the way 2do's own system has (a deliberate, smaller
	// scope for this app, see CLAUDE.md's own note on this).
	let resolved = $derived(
		resolveRecipeVersion(recipe, [uiLocaleStore.locale], versionKey, sessionTranslations)
	);
	let versions = $derived(getRecipeVersions(recipe, sessionTranslations));

	function handleTranslationSubmit(translation: Translation) {
		sessionTranslations = [...sessionTranslations, translation];
		versionKey = translation.id;
		showTranslateModal = false;
	}

	// Module 4's write-side (CLAUDE.md 4.4) — session-only comments layered on top of the mock
	// fixture's own, same "addedX, merged with the loaded data" pattern used throughout this app's
	// P1 build. Reset whenever the viewed recipe changes, not kept across navigations.
	let sessionComments = $state<NodeComment[]>([]);
	$effect(() => {
		recipe.id;
		sessionComments = [];
	});

	let allComments = $derived([...(recipe.comments ?? []), ...sessionComments]);

	function commentsFor(type: NodeType, id: string) {
		return allComments.filter((c) => c.target.type === type && c.target.id === id);
	}

	function addComment(type: NodeType, id: string, content: string, visibility: 'public' | 'private') {
		sessionComments = [
			...sessionComments,
			{
				id: crypto.randomUUID(),
				target: { type, id },
				content,
				visibility,
				author: currentUserRef(),
				createdAt: new Date().toISOString()
			}
		];
	}

	function chooseSubstitution(ingredientId: string, substitutionId: string | null) {
		chosenSubstitutions = { ...chosenSubstitutions };
		if (substitutionId) {
			chosenSubstitutions[ingredientId] = substitutionId;
		} else {
			delete chosenSubstitutions[ingredientId];
		}
	}
</script>

<svelte:head>
	<title>{resolved.fields.name} — Foodia</title>
</svelte:head>

<a href="/" class="back">&larr; {t('recipe.back')}</a>

<h1>{resolved.fields.name}</h1>
<p class="summary">{resolved.fields.summary}</p>
<p class="lede">{resolved.fields.description}</p>

<!-- Passing `key` straight through, including the literal 'original' — resolveRecipeVersion's
     own explicit-key branch is what makes "View Original" always show the TRUE original even when
     the current UI language would otherwise auto-resolve to an existing translation for it. -->
<TranslationBadge {versions} {resolved} onselect={(key) => (versionKey = key)} />
<button type="button" class="btn btn--ghost btn--small suggest-btn" onclick={() => (showTranslateModal = true)}>
	{t('translation.suggest')}
</button>

{#if showTranslateModal}
	<SuggestTranslationModal
		{recipe}
		translatedBy={currentUserRef()}
		extraTranslations={sessionTranslations}
		onsubmit={handleTranslationSubmit}
		onclose={() => (showTranslateModal = false)}
	/>
{/if}

<div class="macros">
	<span>🔥 {t('recipe.kcal', { n: activeMacros.kcal })}</span>
	<span>🥩 {t('recipe.protein', { n: activeMacros.proteinG })}</span>
	<span>🧈 {t('recipe.fat', { n: activeMacros.fatG })}</span>
	<span>🍞 {t('recipe.carbs', { n: activeMacros.carbsG })}</span>
</div>

<a class="cook-cta" href={`/recipes/${recipe.id}/cook`}>▶ {t('recipe.cookCta')}</a>

<section>
	<h2>{t('recipe.ingredientsHeading')}</h2>
	<ul class="ingredients">
		{#each recipe.ingredients as ingredient (ingredient.id)}
			{@const visibleSubs = substitutionsFor(ingredient.id)}
			{@const chosenId = chosenSubstitutions[ingredient.id]}
			{@const chosen = visibleSubs.find((s) => s.id === chosenId)}
			<li class="ingredient">
				<div class="ingredient__row">
					<span>
						{#if chosen}
							<s class="muted">{ingredient.quantity} {ingredient.unit} {ingredient.name}</s>
							→ {ingredient.quantity * chosen.ratio}
							{ingredient.unit}
							{chosen.name}
							{#if substitutionModerationStore.isRecognized(chosen.id)}
								<span class="recognized-badge" title={t('moderation.recognizedBadge')}>⭐</span>
							{/if}
						{:else}
							{ingredient.quantity} {ingredient.unit} {ingredient.name}
						{/if}
					</span>
					{#if ingredient.substitutable}
						<details class="swap">
							<summary>{t('recipe.swap')}</summary>
							<ul>
								<li class="swap-row">
									<button class="swap-choose" onclick={() => chooseSubstitution(ingredient.id, null)}>
										{t('recipe.original')}
									</button>
								</li>
								<!-- Sorted once at render time by the substitution's own base reaction score
								     (sortSubstitutionsByReaction) and deliberately frozen there — re-sorting live
								     as the viewer votes would make rows jump under their cursor mid-click. Already
								     allergy-filtered by `substitutionsFor` before it ever reaches this list — the
								     guardrail never depends on this markup remembering to check it. -->
								{#each sortSubstitutionsByReaction(visibleSubs) as sub (sub.id)}
									<li class="swap-row">
										<button class="swap-choose" onclick={() => chooseSubstitution(ingredient.id, sub.id)}>
											{sub.name}
											{#if substitutionModerationStore.isRecognized(sub.id)}
												<span class="recognized-badge" title={t('moderation.recognizedBadge')}>⭐</span>
											{/if}
										</button>
										<ReactionButtons reactions={sub.reactions} compact />
									</li>
								{/each}
							</ul>
						</details>
					{/if}
				</div>
				{#if ingredient.substitutable}
					<SubstitutionComposer
						onsubmit={(name, ratio) => proposeSubstitution(ingredient.id, name, ratio)}
					/>
				{/if}
				{#each commentsFor('ingredient', ingredient.id) as comment (comment.id)}
					<CommentItem
						{comment}
						context={{ recipeId: recipe.id, recipeName: resolved.fields.name, targetLabel: ingredient.name }}
					/>
				{/each}
				<CommentComposer
					onsubmit={(content, visibility) => addComment('ingredient', ingredient.id, content, visibility)}
				/>
			</li>
		{/each}
	</ul>
</section>

<section>
	<h2>{t('recipe.stepsHeading')}</h2>
	<ol class="steps">
		{#each recipe.steps as step (step.id)}
			{@const visibleAlts = alternativesFor(step.id)}
			{@const chosenAltId = chosenStepAlternatives[step.id]}
			{@const chosenAlt = visibleAlts.find((a) => a.id === chosenAltId)}
			{@const needsAlt = stepNeedsAlternative(step, hardware)}
			{@const missing = missingEquipmentLabel(step.requiresEquipment ?? [], hardware)}
			<li class="step">
				{#if chosenAlt}
					<span>{chosenAlt.text}</span>
					<span class="alt-badge">
						🔁 {t('stepAlternative.viewAlternative')}
						<button
							type="button"
							class="alt-badge__revert"
							onclick={() => chooseStepAlternative(step.id, null)}
						>
							{t('stepAlternative.viewOriginal')}
						</button>
					</span>
				{:else}
					<span>{step.text}</span>
					{#if needsAlt && missing}
						<span class="equipment-warning">{t('stepAlternative.needsEquipment', { equipment: missing })}</span>
					{/if}
				{/if}
				{#if (chosenAlt?.durationMinutes ?? step.durationMinutes)}
					<span class="timer-chip"
						>⏲ {chosenAlt?.durationMinutes ?? step.durationMinutes} min</span
					>
				{/if}
				{#if visibleAlts.length > 0}
					<details class="swap">
						<summary>{t('stepAlternative.browseHeading', { n: visibleAlts.length })}</summary>
						<ul>
							{#if chosenAlt}
								<li class="swap-row">
									<button class="swap-choose" onclick={() => chooseStepAlternative(step.id, null)}>
										{t('recipe.original')}
									</button>
								</li>
							{/if}
							{#each sortAlternativesByReaction(visibleAlts) as alt (alt.id)}
								<li class="swap-row">
									<button class="swap-choose" onclick={() => chooseStepAlternative(step.id, alt.id)}>
										{alt.text}
										<span class="muted">
											— {alt.requiresEquipment?.length
												? alt.requiresEquipment.join(', ')
												: t('stepAlternative.noEquipmentNeeded')}
										</span>
									</button>
									<ReactionButtons reactions={alt.reactions} compact />
								</li>
							{/each}
						</ul>
					</details>
				{/if}
				<StepAlternativeComposer
					onsubmit={(text, requiresEquipment, durationMinutes) =>
						proposeStepAlternative(step.id, text, requiresEquipment, durationMinutes)}
				/>
				{#each commentsFor('step', step.id) as comment (comment.id)}
					<CommentItem
						{comment}
						context={{ recipeId: recipe.id, recipeName: resolved.fields.name, targetLabel: t('moderation.stepLabel', { n: step.order }) }}
					/>
				{/each}
				<CommentComposer
					onsubmit={(content, visibility) => addComment('step', step.id, content, visibility)}
				/>
			</li>
		{/each}
	</ol>
</section>

<style lang="scss">
	.back {
		display: inline-block;
		margin-bottom: var(--space-3);
		color: var(--text-secondary);
		text-decoration: none;
	}
	.summary {
		font-size: 15px;
		font-weight: 600;
		margin: var(--space-1) 0;
	}
	.lede {
		color: var(--text-secondary);
	}
	.suggest-btn {
		margin-bottom: var(--space-4);
	}
	.btn--small {
		padding: var(--space-1) var(--space-3);
		font-size: 12px;
	}
	.macros {
		display: flex;
		gap: var(--space-4);
		margin-bottom: var(--space-3);
		font-size: 14px;
	}
	.cook-cta {
		display: inline-block;
		margin-bottom: var(--space-5);
		padding: var(--space-2) var(--space-4);
		border-radius: var(--radius-pill);
		background: var(--accent);
		color: white;
		font-weight: 600;
		text-decoration: none;
	}
	.ingredients,
	.steps {
		list-style: none;
		padding: 0;
	}
	.ingredient,
	.step {
		padding: var(--space-2) 0;
		border-bottom: 1px solid var(--bg-surface-alt);
	}
	.ingredient__row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--space-3);
	}
	.muted {
		color: var(--text-secondary);
	}
	.recognized-badge {
		font-size: 12px;
	}
	.swap summary {
		cursor: pointer;
		font-size: 13px;
		color: var(--accent);
	}
	.swap ul {
		list-style: none;
		padding: 0;
		margin: var(--space-1) 0 0;
	}
	.swap-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		padding: var(--space-1) 0;
	}
	.swap-choose {
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
		font-size: 13px;
		text-align: left;
		font-family: inherit;
		flex: 1;
	}
	.step {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.timer-chip {
		align-self: flex-start;
		padding: 2px 10px;
		border-radius: var(--radius-pill);
		background: var(--bg-surface-alt);
		font-size: 12px;
	}
	.equipment-warning {
		align-self: flex-start;
		padding: 2px 10px;
		border-radius: var(--radius-pill);
		background: var(--status-warning);
		color: white;
		font-size: 12px;
	}
	.alt-badge {
		align-self: flex-start;
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: 2px 10px;
		border-radius: var(--radius-pill);
		background: var(--accent);
		color: white;
		font-size: 12px;
	}
	.alt-badge__revert {
		background: none;
		border: none;
		color: inherit;
		text-decoration: underline;
		cursor: pointer;
		font-size: 12px;
		padding: 0;
		font-family: inherit;
	}
</style>
