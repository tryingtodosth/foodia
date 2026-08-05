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
	import { pantryStore } from '$lib/state/pantry.svelte';
	import { ingredientDensityStore } from '$lib/state/ingredientDensity.svelte';
	import { sessionStepAlternativesStore } from '$lib/state/stepAlternatives.svelte';
	import { cookingSessionStore } from '$lib/state/cookingSession.svelte';
	import { uiLocaleStore } from '$lib/state/uiLocale.svelte';
	import { page } from '$app/state';
	import ReactionButtons from '$lib/components/comments/ReactionButtons.svelte';
	import CommentItem from '$lib/components/comments/CommentItem.svelte';
	import CommentComposer from '$lib/components/comments/CommentComposer.svelte';
	import TranslationBadge from '$lib/components/recipe/TranslationBadge.svelte';
	import SuggestTranslationModal from '$lib/components/recipe/SuggestTranslationModal.svelte';
	import RecipeMatrix from '$lib/components/recipe/RecipeMatrix.svelte';
	import IngredientSheet from '$lib/components/recipe/IngredientSheet.svelte';
	import StepAlternativeComposer from '$lib/components/recipe/StepAlternativeComposer.svelte';
	import { resolveRecipeVersion, getRecipeVersions } from '$lib/utils/translations';
	import { buildRecipeMatrix } from '$lib/utils/recipeMatrix';
	import { pantryStatusFor, type PantryCoverage } from '$lib/utils/pantryStatus';
	import { formatQuantity } from '$lib/utils/units';
	import { t } from '$lib/i18n/t';
	import type {
		CommentKind,
		Ingredient,
		NodeComment,
		NodeType,
		Translation,
		Substitution,
		StepAlternative,
		Step
	} from '$lib/types/recipe';
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

	/** An unfinished cooking session for this exact recipe, if one is waiting — what turns the cook
	 *  CTA from "start" into "you're 3 steps in, come back". Reading it here is the cheapest possible
	 *  resume affordance: the session store denormalizes `stepIndex`/`stepCount` precisely so a
	 *  banner like this needs no extra fetch. */
	let cookingSession = $derived(
		cookingSessionStore.hydrated
			? (() => {
					const s = cookingSessionStore.forRecipe(recipe.id);
					return s && !s.finishedAt ? s : undefined;
				})()
			: undefined
	);

	/** Hands this page's own chosen swaps to the session as its starting point. Only ever applied to
	 *  a NEW session (`start`'s own rule) — re-entering a session already in progress must not
	 *  overwrite what the cook has since decided at the stove with what the recipe page still has
	 *  selected. */
	function seedCookingSession() {
		const substitutions: Record<string, { ingredientId: string; substitutionId: string; name: string; ratio: number }> = {};
		for (const [ingredientId, substitutionId] of Object.entries(chosenSubstitutions)) {
			const sub = findSubstitutionById(substitutionId);
			if (sub) substitutions[ingredientId] = { ingredientId, substitutionId, name: sub.name, ratio: sub.ratio };
		}
		cookingSessionStore.start(
			{ recipeId: recipe.id, recipeName: resolved.fields.name, stepCount: recipe.steps.length },
			{ substitutions }
		);
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
		visibility: 'public' | 'private',
		extras?: { kind: CommentKind; imageUrl?: string }
	): Promise<boolean> {
		const kind = extras?.kind ?? 'note';
		const imageUrl = extras?.imageUrl;
		const result = await postJson('/api/comments', {
			recipeId: recipe.id,
			targetType: type,
			targetId: id,
			content,
			visibility,
			kind,
			imageUrl
		});
		if (!result) return false;
		sessionComments = [
			...sessionComments,
			{
				id: result.id,
				target: { type, id },
				content,
				visibility,
				kind,
				imageUrl,
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

	// --- The default view: the tabular summary (Session 27) -------------------------------------
	// Built from data that already existed — `Step.ingredientIds` has been in this app's type since
	// the Recipe Graph was designed, and this is the first thing to actually READ it for anything
	// other than Cooking Mode's per-step highlight. See lib/utils/recipeMatrix.ts for the layout,
	// including the one structural assumption it makes and why.
	let matrix = $derived(buildRecipeMatrix(recipe.ingredients, recipe.steps));

	/** The line the matrix prints for a row, swap-aware. Derived here rather than in the component
	 *  so the table and the ingredient list below it can never disagree about what's in the dish. */
	function displayFor(ingredient: Ingredient): { text: string; swapped: boolean } {
		const chosen = substitutionsFor(ingredient.id).find(
			(s) => s.id === chosenSubstitutions[ingredient.id]
		);
		if (chosen) {
			return {
				text: `${formatQuantity(ingredient.quantity * chosen.ratio)} ${ingredient.unit} ${chosen.name}`,
				swapped: true
			};
		}
		return {
			text: `${formatQuantity(ingredient.quantity)} ${ingredient.unit} ${ingredient.name}`,
			swapped: false
		};
	}

	/** Reads the pantry through the same resolver `/shopping-list` uses, so a tick here means
	 *  exactly what a covered row means there. Returns null until the pantry has hydrated —
	 *  rendering "you have none of this" during SSR and the first client frame would be a claim the
	 *  app hasn't yet checked. */
	function pantryCoverageFor(ingredient: Ingredient): PantryCoverage | null {
		if (!pantryStore.hydrated) return null;
		const chosen = substitutionsFor(ingredient.id).find(
			(s) => s.id === chosenSubstitutions[ingredient.id]
		);
		const effective = chosen
			? { name: chosen.name, quantity: ingredient.quantity * chosen.ratio, unit: ingredient.unit }
			: ingredient;
		return pantryStatusFor(effective, pantryStore.items, ingredientDensityStore.classFor).coverage;
	}

	// Which ingredient's sheet is open. Held as an ID, not the object: the ingredient array is
	// re-derived whenever `data` changes, and a captured object would go stale against it.
	let sheetIngredientId = $state<string | null>(null);
	let sheetIngredient = $derived(
		recipe.ingredients.find((i) => i.id === sheetIngredientId) ?? null
	);
	$effect(() => {
		recipe.id;
		sheetIngredientId = null;
	});
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

<!-- Two things happen on this one click, in this order. First the swaps chosen on THIS page are
     handed to the cooking session as its starting assumption — closing the second half of CLAUDE.md
     Section 7 item 27, which deliberately left ingredient substitutions out of the cross-route fix
     step alternatives got, on the grounds that "Cooking Mode doesn't render ingredients at all yet,
     so there's nothing there for a session-proposed substitution to feed into." There is now.
     Second, the link navigates as normal. Kept as an <a> rather than a button+goto so it still
     behaves like a link (middle-click, long-press) — the store write is synchronous, so it lands
     before any navigation, client-side or full-page. -->
<a
	class="cook-cta"
	class:cook-cta--resume={cookingSession !== undefined}
	href={`/recipes/${recipe.id}/cook`}
	onclick={seedCookingSession}
>
	{#if cookingSession}
		⏸ {t('recipe.resumeCookCta', {
			n: cookingSession.stepIndex + 1,
			total: cookingSession.stepCount
		})}
	{:else}
		▶ {t('recipe.cookCta')}
	{/if}
</a>

<!-- The default view, at the top, before any prose: what goes in with what, and in what order.
     Everything below it is the same recipe in longer form. -->
<section class="summary-section">
	<h2>{t('matrix.heading')}</h2>
	<RecipeMatrix
		{matrix}
		{displayFor}
		coverageFor={pantryCoverageFor}
		noteCountFor={(ingredient) => commentsFor('ingredient', ingredient.id).length}
		onselect={(ingredient) => (sheetIngredientId = ingredient.id)}
	/>
</section>

{#if sheetIngredient}
	<!-- Bound to a `const` rather than used directly, so the callbacks below close over a value
	     TypeScript has genuinely narrowed instead of a reassignable `Ingredient | null`. -->
	{@const openIngredient = sheetIngredient}
	<IngredientSheet
		ingredient={openIngredient}
		recipeId={recipe.id}
		recipeName={resolved.fields.name}
		substitutions={substitutionsFor(openIngredient.id)}
		chosenSubstitutionId={chosenSubstitutions[openIngredient.id] ?? null}
		{commentsFor}
		canUpload={page.data.canUpload === true}
		onchoose={(substitutionId) => chooseSubstitution(openIngredient.id, substitutionId)}
		onpropose={(name, ratio) => proposeSubstitution(openIngredient.id, name, ratio)}
		onaddcomment={addComment}
		onclose={() => (sheetIngredientId = null)}
	/>
{/if}

<!-- One prompt for the whole page, not one per composer (this page's original per-gate version —
     one `{@render loginPrompt()}` at every propose/comment composer, including inside each
     substitution/step-alternative's own discussion thread — showed this same sentence up to 22
     times on a single real recipe, 7 ingredients + 4 steps × 2 composers each, a real bug a live
     user caught, not a hypothetical). Every composer below (including inside `discussionThread`)
     now just renders nothing at all when unauthenticated instead of its own copy of this message. -->
{#if authStore.hydrated && !authStore.isAuthenticated}
	{@render loginPrompt()}
{/if}

<section>
	<h2>{t('recipe.ingredientsHeading')}</h2>
	<!-- Session 27 — every per-ingredient control (swap picker, propose-a-swap, the comment thread
	     and its composer, plus each swap's own discussion) moved into `IngredientSheet`, which is
	     what "touching an ingredient opens a modal" asks for. This list is deliberately NOT a second
	     place to do the same things: keeping both would mean two swap pickers on one page that can
	     disagree, and it's exactly what made this page render the same login prompt 22 times before.
	     What stays here is the canonical, linear, printable ingredient list — the thing the matrix
	     above is a summary OF. -->
	<ul class="ingredients">
		{#each recipe.ingredients as ingredient (ingredient.id)}
			{@const visibleSubs = substitutionsFor(ingredient.id)}
			{@const chosenId = chosenSubstitutions[ingredient.id]}
			{@const chosen = visibleSubs.find((s) => s.id === chosenId)}
			{@const notes = commentsFor('ingredient', ingredient.id).length}
			{@const coverage = pantryCoverageFor(ingredient)}
			<li class="ingredient">
				<button
					type="button"
					class="ingredient__row"
					onclick={() => (sheetIngredientId = ingredient.id)}
				>
					<span>
						{#if chosen}
							<s class="muted">{ingredient.quantity} {ingredient.unit} {ingredient.name}</s>
							→ {formatQuantity(ingredient.quantity * chosen.ratio)}
							{ingredient.unit}
							{chosen.name}
							{#if substitutionModerationStore.isRecognized(chosen.id)}
								<span class="recognized-badge" title={t('moderation.recognizedBadge')}>⭐</span>
							{/if}
						{:else}
							{ingredient.quantity} {ingredient.unit} {ingredient.name}
						{/if}
					</span>
					<span class="ingredient__marks">
						{#if coverage === 'enough'}
							<span class="mark mark--enough" title={t('matrix.pantryEnough')}>✓</span>
						{:else if coverage === 'partial' || coverage === 'unresolved'}
							<span
								class="mark mark--partial"
								title={coverage === 'partial'
									? t('matrix.pantryPartial')
									: t('matrix.pantryUnresolved')}
							>
								{coverage === 'partial' ? '◐' : '?'}
							</span>
						{/if}
						{#if notes > 0}
							<span class="mark">💬{notes}</span>
						{/if}
						{#if visibleSubs.length > 0}
							<span class="mark">🔀{visibleSubs.length}</span>
						{/if}
						<span class="ingredient__open">{t('recipe.openIngredient')}</span>
					</span>
				</button>
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

		/* A session left mid-recipe reads as unfinished business, not as a fresh start. */
		&--resume {
			background: var(--status-warning);
		}
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
		width: 100%;
		background: none;
		border: none;
		padding: var(--space-1) 0;
		font-family: inherit;
		font-size: inherit;
		color: inherit;
		text-align: left;
		cursor: pointer;

		&:hover .ingredient__open,
		&:focus-visible .ingredient__open {
			color: var(--accent);
		}
	}
	.ingredient__marks {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-shrink: 0;
	}
	.mark {
		font-size: 11px;
		color: var(--text-secondary);
	}
	.mark--enough {
		color: var(--status-success);
		font-weight: 700;
	}
	.mark--partial {
		color: var(--status-warning);
		font-weight: 700;
	}
	.ingredient__open {
		font-size: 12px;
		color: var(--text-secondary);
	}
	.summary-section h2 {
		font-size: 16px;
		margin-bottom: var(--space-2);
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
		margin: var(--space-1) 0;
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-card);
		background: var(--bg-surface-alt);
		font-size: 13px;
		color: var(--text-secondary);

		a {
			color: var(--accent);
			font-weight: 600;
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
