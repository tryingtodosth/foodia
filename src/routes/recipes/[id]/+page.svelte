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
	import { authStore } from '$lib/state/auth.svelte';
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
	import type { NodeComment, NodeType, Translation, Substitution, StepAlternative, Step } from '$lib/types/recipe';
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

	// Session 22 — real POST /api/substitutions writes now (previously a pure client-side push that
	// never reached D1 at all, discovered while auditing this page for "are substitutions really
	// discussable" — the exact same gap `addComment` below had). Still layered as "addedX, merged
	// with the loaded fixture" on top of `recipe.ingredients`' own data, same pattern every other
	// write-side feature here uses — a real reload picks the new row up through the normal server
	// load instead, this is just what makes it show up without one.
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

	/** Real POST /api/substitutions — returns null on failure (network error, validation, or not
	 *  logged in) so the composer can show an inline error and keep the form open, rather than
	 *  silently discarding what was typed. */
	async function postJson(url: string, body: unknown): Promise<{ id: string } | null> {
		try {
			const res = await fetch(url, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (!res.ok) return null;
			return await res.json();
		} catch {
			return null;
		}
	}

	async function proposeSubstitution(ingredientId: string, name: string, ratio: number): Promise<boolean> {
		const result = await postJson('/api/substitutions', { forIngredientId: ingredientId, name, ratio });
		if (!result) return false;
		sessionSubstitutions = [
			...sessionSubstitutions,
			{
				id: result.id,
				forIngredientId: ingredientId,
				name,
				ratio,
				source: 'community',
				proposedBy: currentUserRef()
			}
		];
		return true;
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

	/** Real POST /api/step-alternatives (Session 22 — previously `sessionStepAlternativesStore`
	 *  only ever held this in one browser tab's memory, never a real D1 row; the exact same gap
	 *  `proposeSubstitution` above just had). `triggeredBySubstitutionId` links this alternative to
	 *  the specific ingredient swap that necessitates it, when there is one — see `linkedSubstitutionFor`. */
	async function proposeStepAlternative(
		stepId: string,
		text: string,
		requiresEquipment: string[],
		durationMinutes: number | null,
		triggeredBySubstitutionId?: string
	): Promise<boolean> {
		const result = await postJson('/api/step-alternatives', {
			forStepId: stepId,
			text,
			requiresEquipment: requiresEquipment.length > 0 ? requiresEquipment : undefined,
			durationMinutes: durationMinutes ?? undefined,
			triggeredBySubstitutionId
		});
		if (!result) return false;
		sessionStepAlternativesStore.propose(recipe.id, {
			id: result.id,
			forStepId: stepId,
			text,
			requiresEquipment: requiresEquipment.length > 0 ? requiresEquipment : undefined,
			durationMinutes: durationMinutes ?? undefined,
			triggeredBySubstitutionId,
			source: 'community',
			proposedBy: currentUserRef()
		});
		return true;
	}

	/**
	 * The ingredient swap "in effect" for a step right now, if any — the first of the step's own
	 * ingredients that currently has a substitution chosen. Used two ways: as the implicit link a
	 * freshly-proposed step alternative gets attributed to (propose one while a swap is active and
	 * it's automatically "the step change for that swap," no separate picker needed), and to look
	 * up whether the community already logged one (`suggestedAlternativeFor`). A step with more than
	 * one actively-swapped ingredient just takes the first match — a real, small simplification, not
	 * a case this app's own recipes currently exercise (no step here uses two substitutable
	 * ingredients from two different swaps at once).
	 */
	function linkedSubstitutionFor(step: Step): string | undefined {
		for (const ingredientId of step.ingredientIds) {
			const subId = chosenSubstitutions[ingredientId];
			if (subId) return subId;
		}
		return undefined;
	}

	/** An already-proposed StepAlternative that exists specifically because of the swap currently
	 *  active on this step, if the community has already logged one — surfaced as a one-click
	 *  suggestion rather than applied automatically (CLAUDE.md's own "never silently change what a
	 *  cook is looking at mid-recipe" discipline, same reasoning stepAlternative.usingAlternative's
	 *  equipment-driven auto-swap already documents choosing NOT to extend to this case). */
	function suggestedAlternativeFor(step: Step): StepAlternative | undefined {
		const activeSubId = linkedSubstitutionFor(step);
		if (!activeSubId) return undefined;
		return alternativesFor(step.id).find((a) => a.triggeredBySubstitutionId === activeSubId);
	}

	/** Resolves a substitution id to its own name/data for display — searches both the loaded
	 *  fixture data and this session's own freshly-proposed substitutions, since a `StepAlternative`
	 *  can be triggered by either. No single global substitution index exists on this page (each
	 *  ingredient owns its own list), so this is a real, if small, linear scan. */
	function findSubstitutionById(id: string): Substitution | undefined {
		for (const ingredient of recipe.ingredients) {
			const found = (ingredient.substitutions ?? []).find((s) => s.id === id);
			if (found) return found;
		}
		return sessionSubstitutions.find((s) => s.id === id);
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

	// Module 4's write-side (CLAUDE.md 4.4) — real POST /api/comments now (Session 22; previously a
	// pure client-side push under the same "session-only" framing every other write-side feature in
	// this app used to carry, which turned out to mean these comments never reached D1 at all — a
	// real gap only found by auditing whether "discussable" was actually true). Layered as "addedX,
	// merged with the loaded data" on top of `recipe.comments` for the same reason `sessionSubstitutions`
	// is above: a real reload picks the new row up through the normal server load either way, this
	// is just what makes it show up without one. Still reset whenever the viewed recipe changes.
	let sessionComments = $state<NodeComment[]>([]);
	$effect(() => {
		recipe.id;
		sessionComments = [];
	});

	let allComments = $derived([...(recipe.comments ?? []), ...sessionComments]);

	function commentsFor(type: NodeType, id: string) {
		return allComments.filter((c) => c.target.type === type && c.target.id === id);
	}

	async function addComment(
		type: NodeType,
		id: string,
		content: string,
		visibility: 'public' | 'private'
	): Promise<boolean> {
		const result = await postJson('/api/comments', { recipeId: recipe.id, targetType: type, targetId: id, content, visibility });
		if (!result) return false;
		sessionComments = [
			...sessionComments,
			{
				id: result.id,
				target: { type, id },
				content,
				visibility,
				author: currentUserRef(),
				createdAt: new Date().toISOString()
			}
		];
		return true;
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

<!-- `authStore.hydrate()` is fire-and-forget async (auth.svelte.ts's own doc comment) — `isAuthenticated`
     starts false and only flips true once the real session check resolves. Guarding on `hydrated`
     first here (and at every other `isAuthenticated` gate below) avoids the false "please log in"
     flash a genuinely logged-in visitor would otherwise see for that split second, the same
     discipline `/recipes/new` already established for its own composer gate. -->
{#snippet loginPrompt()}
	{#if authStore.hydrated}
		<p class="login-prompt">
			{t('comment.loginRequired')}
			<a href={`/login?redirectTo=${encodeURIComponent(`/recipes/${recipe.id}`)}`}>{t('comment.loginLink')}</a>
		</p>
	{/if}
{/snippet}

<!-- Reused for both Substitutions and StepAlternatives (Session 22) — the node types this app's
     own type system already named (`NodeType` includes 'substitution'/'step_alternative') but
     whose comment threads the UI never actually rendered until now. Collapsed by default, unlike
     the always-visible ingredient/step threads below it: this renders once per swap-list ROW, and
     a recipe with several proposed alternatives per ingredient would otherwise show that many full
     threads open at once. -->
{#snippet discussionThread(targetType: NodeType, targetId: string, targetLabel: string)}
	{@const threadComments = commentsFor(targetType, targetId)}
	<details class="discussion">
		<summary>{t('comment.discussionToggle', { n: threadComments.length })}</summary>
		{#each threadComments as comment (comment.id)}
			<CommentItem
				{comment}
				context={{ recipeId: recipe.id, recipeName: resolved.fields.name, targetLabel }}
			/>
		{/each}
		{#if authStore.hydrated && authStore.isAuthenticated}
			<CommentComposer
				onsubmit={(content, visibility) => addComment(targetType, targetId, content, visibility)}
			/>
		{:else}
			{@render loginPrompt()}
		{/if}
	</details>
{/snippet}

<svelte:head>
	<title>{resolved.fields.name} — Foodia</title>
</svelte:head>

<a href="/" class="back">&larr; {t('recipe.back')}</a>

<h1>{resolved.fields.name}</h1>
<a class="author-link" href={`/users/${recipe.author.id}`}>{t('recipe.byAuthor', { author: recipe.author.displayName })}</a>
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
									<li class="swap-row swap-row--column">
										<div class="swap-row__main">
											<button class="swap-choose" onclick={() => chooseSubstitution(ingredient.id, sub.id)}>
												{sub.name}
												{#if substitutionModerationStore.isRecognized(sub.id)}
													<span class="recognized-badge" title={t('moderation.recognizedBadge')}>⭐</span>
												{/if}
											</button>
											<ReactionButtons reactions={sub.reactions} compact />
										</div>
										{#if sub.proposedBy}
											<a class="proposed-by" href={`/users/${sub.proposedBy.id}`}>
												{t('substitution.proposedBy', { name: sub.proposedBy.displayName })}
											</a>
										{/if}
										<!-- The ask this closes: "alternatives to certain ingredients need to be able
										     to be discussed by users" — each swap option gets its own real thread, not
										     just the parent ingredient's. -->
										{@render discussionThread('substitution', sub.id, sub.name)}
									</li>
								{/each}
							</ul>
						</details>
					{/if}
				</div>
				{#if ingredient.substitutable}
					{#if authStore.hydrated && authStore.isAuthenticated}
						<SubstitutionComposer
							onsubmit={(name, ratio) => proposeSubstitution(ingredient.id, name, ratio)}
						/>
					{:else}
						{@render loginPrompt()}
					{/if}
				{/if}
				{#each commentsFor('ingredient', ingredient.id) as comment (comment.id)}
					<CommentItem
						{comment}
						context={{ recipeId: recipe.id, recipeName: resolved.fields.name, targetLabel: ingredient.name }}
					/>
				{/each}
				{#if authStore.hydrated && authStore.isAuthenticated}
					<CommentComposer
						onsubmit={(content, visibility) => addComment('ingredient', ingredient.id, content, visibility)}
					/>
				{:else}
					{@render loginPrompt()}
				{/if}
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
			{@const activeSubId = linkedSubstitutionFor(step)}
			{@const suggestedAlt = !chosenAlt ? suggestedAlternativeFor(step) : undefined}
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
				<!-- The other half of the ask: "a change of ingredient might induce a change of steps" —
				     once the community has logged a step change FOR the swap you just picked, offer it
				     as a one-click suggestion rather than silently rewriting the step under you. -->
				{#if suggestedAlt}
					{@const suggestedSub = findSubstitutionById(activeSubId ?? '')}
					<div class="swap-suggestion">
						<span>{t('stepAlternative.suggestedForSwap', { name: suggestedSub?.name ?? '' })} {suggestedAlt.text}</span>
						<button type="button" class="btn btn--small btn--primary" onclick={() => chooseStepAlternative(step.id, suggestedAlt.id)}>
							{t('stepAlternative.applySuggestion')}
						</button>
					</div>
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
								{@const linkedSub = alt.triggeredBySubstitutionId ? findSubstitutionById(alt.triggeredBySubstitutionId) : undefined}
								<li class="swap-row swap-row--column">
									<div class="swap-row__main">
										<button class="swap-choose" onclick={() => chooseStepAlternative(step.id, alt.id)}>
											{alt.text}
											<span class="muted">
												— {alt.requiresEquipment?.length
													? alt.requiresEquipment.join(', ')
													: t('stepAlternative.noEquipmentNeeded')}
											</span>
										</button>
										<ReactionButtons reactions={alt.reactions} compact />
									</div>
									{#if linkedSub}
										<span class="linked-badge">{t('stepAlternative.linkedToSwap', { name: linkedSub.name })}</span>
									{/if}
									{#if alt.proposedBy}
										<a class="proposed-by" href={`/users/${alt.proposedBy.id}`}>
											{t('substitution.proposedBy', { name: alt.proposedBy.displayName })}
										</a>
									{/if}
									{@render discussionThread('step_alternative', alt.id, alt.text)}
								</li>
							{/each}
						</ul>
					</details>
				{/if}
				{#if authStore.hydrated && authStore.isAuthenticated}
					<StepAlternativeComposer
						toggleLabel={activeSubId ? t('stepAlternative.proposeForSwapToggle') : undefined}
						onsubmit={(text, requiresEquipment, durationMinutes) =>
							proposeStepAlternative(step.id, text, requiresEquipment, durationMinutes, activeSubId)}
					/>
				{:else}
					{@render loginPrompt()}
				{/if}
				{#each commentsFor('step', step.id) as comment (comment.id)}
					<CommentItem
						{comment}
						context={{ recipeId: recipe.id, recipeName: resolved.fields.name, targetLabel: t('moderation.stepLabel', { n: step.order }) }}
					/>
				{/each}
				{#if authStore.hydrated && authStore.isAuthenticated}
					<CommentComposer
						onsubmit={(content, visibility) => addComment('step', step.id, content, visibility)}
					/>
				{:else}
					{@render loginPrompt()}
				{/if}
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
	.author-link {
		display: inline-block;
		font-size: 13px;
		color: var(--text-secondary);
		text-decoration: none;

		&:hover {
			text-decoration: underline;
		}
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
	.swap-row--column {
		flex-direction: column;
		align-items: stretch;
	}
	.swap-row__main {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}
	.discussion {
		margin-top: var(--space-1);
		font-size: 12px;

		summary {
			cursor: pointer;
			color: var(--text-secondary);
		}
	}
	.linked-badge {
		margin-top: 2px;
		font-size: 11px;
		color: var(--text-secondary);
	}
	.proposed-by {
		margin-top: 2px;
		font-size: 11px;
		color: var(--text-secondary);
		text-decoration: none;

		&:hover {
			text-decoration: underline;
		}
	}
	.login-prompt {
		margin: var(--space-1) 0 0;
		padding-left: var(--space-3);
		font-size: 12px;
		color: var(--text-secondary);

		a {
			color: var(--accent);
		}
	}
	.swap-suggestion {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		flex-wrap: wrap;
		align-self: stretch;
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-card);
		background: var(--bg-surface-alt);
		font-size: 12px;
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
