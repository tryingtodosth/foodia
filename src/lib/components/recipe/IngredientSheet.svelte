<script lang="ts">
	// Touching an ingredient anywhere on a recipe opens this: everything that ingredient IS to this
	// cook, in one place — what it can be swapped for, what people have said about it, what it
	// looked like, where it came from, whether it's already in the pantry, and how to get it onto
	// the week's plan so the shopping list stops asking for things they already own.
	//
	// It owns none of that data. Substitutions, comments and the swap currently in effect all belong
	// to the recipe page (which is also what renders them in the canonical lists further down the
	// same page); the pantry, density and meal-plan stores are read directly, the same way
	// CommentItem reads the moderation store. What this component owns is the sheet itself: which
	// tab is open, what's typed into the pantry and planner forms, and nothing else.
	import { pantryStore } from '$lib/state/pantry.svelte';
	import { mealPlanStore } from '$lib/state/mealPlan.svelte';
	import { ingredientDensityStore } from '$lib/state/ingredientDensity.svelte';
	import { substitutionModerationStore } from '$lib/state/substitutionModeration.svelte';
	import { authStore } from '$lib/state/auth.svelte';
	import { uiLocaleStore } from '$lib/state/uiLocale.svelte';
	import { pantryStatusFor } from '$lib/utils/pantryStatus';
	import { formatQuantity } from '$lib/utils/units';
	import { toISODate, mondayOf, addDays, weekDates, weekdayLabel, formatShortDate } from '$lib/utils/week';
	import { sortSubstitutionsByReaction } from '$lib/utils/substitution';
	import ReactionButtons from '$lib/components/comments/ReactionButtons.svelte';
	import CommentItem from '$lib/components/comments/CommentItem.svelte';
	import CommentComposer from '$lib/components/comments/CommentComposer.svelte';
	import SubstitutionComposer from '$lib/components/recipe/SubstitutionComposer.svelte';
	import DensityPrompt from '$lib/components/shared/DensityPrompt.svelte';
	import { t } from '$lib/i18n/t';
	import type {
		CommentKind,
		Ingredient,
		NodeComment,
		NodeType,
		Substitution
	} from '$lib/types/recipe';
	import type { MealSlotKind } from '$lib/types/pantry';

	let {
		ingredient,
		recipeId,
		recipeName,
		substitutions,
		chosenSubstitutionId = null,
		commentsFor,
		canUpload = false,
		onchoose,
		onpropose,
		onaddcomment,
		onclose
	}: {
		ingredient: Ingredient;
		recipeId: string;
		recipeName: string;
		/** Already allergy-filtered by the page (`substitutionsFor`) — this component must never be
		 *  the thing that decides what's safe to show, so it never filters and never could. */
		substitutions: Substitution[];
		chosenSubstitutionId?: string | null;
		/** Threads are looked up by target rather than handed over as one flat list: this sheet
		 *  renders the ingredient's own thread AND a thread per proposed swap, which is a real
		 *  feature the recipe page already had and which flattening would have quietly dropped. */
		commentsFor: (type: NodeType, id: string) => NodeComment[];
		canUpload?: boolean;
		onchoose: (substitutionId: string | null) => void;
		onpropose: (name: string, ratio: number) => Promise<boolean>;
		onaddcomment: (
			type: NodeType,
			id: string,
			content: string,
			visibility: 'public' | 'private',
			extras: { kind: CommentKind; imageUrl?: string }
		) => Promise<boolean>;
		onclose: () => void;
	} = $props();

	type Tab = 'pantry' | 'swaps' | 'notes' | 'plan';
	// Opens on the pantry: the first question a cook has about a specific ingredient, far more often
	// than any other, is whether they need to buy it.
	let tab = $state<Tab>('pantry');

	let chosen = $derived(substitutions.find((s) => s.id === chosenSubstitutionId) ?? null);
	/** What this ingredient actually resolves to right now — a chosen swap changes both the name and
	 *  the amount, and every one of the pantry, shopping and planner answers below has to be about
	 *  the thing the cook is really going to buy, not the one the recipe was written with. */
	let effective = $derived({
		name: chosen ? chosen.name : ingredient.name,
		quantity: chosen ? ingredient.quantity * chosen.ratio : ingredient.quantity,
		unit: ingredient.unit
	});

	let status = $derived(
		pantryStatusFor(effective, pantryStore.items, ingredientDensityStore.classFor)
	);

	// Seeded from the recipe, then freely editable — a cook logging a purchase almost never bought
	// exactly the amount one recipe calls for. Re-seeds whenever the resolved ingredient changes
	// (opening the sheet on a different row, or picking a swap while it's open).
	let addQuantity = $state(0);
	let addUnit = $state('');
	$effect(() => {
		const suggested = status.missingQuantity > 0 ? status.missingQuantity : effective.quantity;
		addQuantity = Math.round(suggested * 10) / 10;
		addUnit = effective.unit;
	});

	// Both confirmations are about one specific action on one specific ingredient — leaving them up
	// after the sheet moves to another row would claim something that never happened there.
	let justAdded = $state(false);
	let planAdded = $state(false);
	$effect(() => {
		ingredient.id;
		justAdded = false;
		planAdded = false;
		tab = 'pantry';
	});
	function addToPantry() {
		if (addQuantity <= 0) return;
		pantryStore.add({ ingredientName: effective.name, quantity: addQuantity, unit: addUnit });
		justAdded = true;
	}

	// --- Meal planner -------------------------------------------------------------------------
	// Two weeks, not a full date picker: "this week" and "next week" is the entire realistic range
	// for deciding to cook something you're looking at right now, and /plan itself is one link away
	// for anything further out.
	let thisWeek = $derived(toISODate(mondayOf(new Date())));
	let nextWeek = $derived(toISODate(addDays(mondayOf(new Date()), 7)));
	let planWeek = $state('');
	$effect(() => {
		if (!planWeek) planWeek = thisWeek;
	});

	let weekPlans = $derived(mealPlanStore.hydrated ? mealPlanStore.plansForWeek(planWeek) : []);
	let planId = $state('');
	// Whenever the chosen week genuinely has plans and none is selected (or the selected one belongs
	// to the other week), fall back to the first — never leaves the picker pointing at nothing.
	$effect(() => {
		if (weekPlans.length === 0) {
			planId = '';
		} else if (!weekPlans.some((p) => p.id === planId)) {
			planId = weekPlans[0].id;
		}
	});

	let planDay = $state('');
	$effect(() => {
		const days = weekDates(planWeek);
		if (!days.includes(planDay)) planDay = days[0];
	});
	let planSlot = $state<MealSlotKind>('dinner');

	const SLOTS: MealSlotKind[] = ['breakfast', 'lunch', 'dinner', 'snack'];
	function slotLabel(slot: MealSlotKind): string {
		switch (slot) {
			case 'breakfast':
				return t('plan.slot.breakfast');
			case 'lunch':
				return t('plan.slot.lunch');
			case 'dinner':
				return t('plan.slot.dinner');
			default:
				return t('plan.slot.snack');
		}
	}

	function createPlan() {
		planId = mealPlanStore.createPlan(planWeek, t('ingredientSheet.newPlanName'));
	}

	function addToPlan() {
		if (!planId || !planDay) return;
		mealPlanStore.assign(planId, planDay, planSlot, recipeId, 1);
		planAdded = true;
	}

	// --- Notes --------------------------------------------------------------------------------
	let ingredientComments = $derived(commentsFor('ingredient', ingredient.id));
	let stories = $derived(ingredientComments.filter((c) => c.kind === 'story'));
	let notes = $derived(ingredientComments.filter((c) => c.kind !== 'story'));
	// Photos come out of the same thread rather than a separate store — a photo IS a comment here
	// (see the `comments.image_url` column's own note), so it appears both in the strip at the top
	// and in place in the conversation it belongs to.
	let photos = $derived(ingredientComments.filter((c) => c.imageUrl));

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) onclose();
	}
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
	}

	// Focus moves into the sheet on open — without it, Escape lands on whatever was focused behind
	// the overlay (the ingredient row that opened it) and never reaches the handler above.
	let sheetEl = $state<HTMLDivElement | null>(null);
	$effect(() => {
		sheetEl?.focus();
	});
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Same overlay shape SuggestTranslationModal already established (a focusable backdrop carrying
     its own label) rather than a bare div with a click handler, which svelte-check's a11y rules
     correctly refuse. -->
<div
	class="sheet-overlay"
	role="button"
	tabindex="0"
	aria-label={t('comment.cancel')}
	onclick={handleBackdropClick}
	onkeydown={handleKeydown}
>
	<div
		class="sheet"
		role="dialog"
		aria-modal="true"
		aria-label={effective.name}
		tabindex="-1"
		bind:this={sheetEl}
	>
		<header class="sheet__head">
			<div>
				<h2>{effective.name}</h2>
				<p class="sheet__amount">
					{formatQuantity(effective.quantity)}
					{effective.unit}
					{#if chosen}
						<span class="sheet__swapped">
							{t('ingredientSheet.swappedFrom', { name: ingredient.name })}
						</span>
					{/if}
				</p>
			</div>
			<button type="button" class="sheet__close" onclick={onclose} aria-label={t('comment.cancel')}>
				✕
			</button>
		</header>

		<div class="sheet__tabs" role="tablist">
			{#each [{ id: 'pantry' as Tab, label: `🥫 ${t('ingredientSheet.tabPantry')}` }, { id: 'swaps' as Tab, label: `🔀 ${t('ingredientSheet.tabSwaps')} (${substitutions.length})` }, { id: 'notes' as Tab, label: `💬 ${t('ingredientSheet.tabNotes')} (${ingredientComments.length})` }, { id: 'plan' as Tab, label: `📅 ${t('ingredientSheet.tabPlan')}` }] as item (item.id)}
				<button
					type="button"
					role="tab"
					class="sheet__tab"
					class:active={tab === item.id}
					aria-selected={tab === item.id}
					onclick={() => (tab = item.id)}
				>
					{item.label}
				</button>
			{/each}
		</div>

		<div class="sheet__body">
			{#if tab === 'pantry'}
				<p class="status status--{status.coverage}">
					{#if status.coverage === 'enough'}
						✓ {t('ingredientSheet.haveEnough', {
							have: formatQuantity(status.haveQuantity),
							unit: effective.unit
						})}
					{:else if status.coverage === 'partial'}
						◐ {t('ingredientSheet.havePartial', {
							have: formatQuantity(status.haveQuantity),
							missing: formatQuantity(status.missingQuantity),
							unit: effective.unit
						})}
					{:else if status.coverage === 'unresolved'}
						<!-- Never rendered as "you don't have it": the pantry genuinely holds this ingredient,
						     the app just can't compare the two units yet. Answering the question below is what
						     turns this into a real number, here and on the shopping list at the same time. -->
						? {t('ingredientSheet.haveUnresolved')}
					{:else}
						{t('ingredientSheet.haveNone')}
					{/if}
				</p>

				{#if status.matchingItems.length > 0}
					<ul class="pantry-rows">
						{#each status.matchingItems as item (item.id)}
							<li>{formatQuantity(item.quantity)} {item.unit} {item.ingredientName}</li>
						{/each}
					</ul>
				{/if}

				{#if status.unitStatus === 'needsDensity'}
					<DensityPrompt ingredientName={effective.name} />
				{/if}

				<form
					class="inline-form"
					onsubmit={(e) => {
						e.preventDefault();
						addToPantry();
					}}
				>
					<input
						type="number"
						min="0"
						step="0.1"
						bind:value={addQuantity}
						aria-label={t('pantry.quantityLabel')}
					/>
					<input type="text" bind:value={addUnit} aria-label={t('pantry.unitLabel')} />
					<button type="submit" class="btn btn--primary">{t('ingredientSheet.addToPantry')}</button>
				</form>
				{#if justAdded}
					<p class="ok">{t('ingredientSheet.addedToPantry')} <a href="/pantry">{t('nav.pantry')}</a></p>
				{/if}
			{:else if tab === 'swaps'}
				{#if substitutions.length === 0}
					<p class="muted">
						{ingredient.substitutable
							? t('ingredientSheet.noSwapsYet')
							: t('ingredientSheet.notSwappable')}
					</p>
				{:else}
					<ul class="swaps">
						<li class="swap">
							<button
								type="button"
								class="swap__choose"
								class:active={!chosen}
								onclick={() => onchoose(null)}
							>
								{t('recipe.original')} — {ingredient.quantity}
								{ingredient.unit}
								{ingredient.name}
							</button>
						</li>
						<!-- Sorted once by base reaction score and frozen there, exactly as the recipe page's
						     own swap list does — re-sorting live as the viewer votes makes rows jump under
						     the cursor mid-click. -->
						{#each sortSubstitutionsByReaction(substitutions) as sub (sub.id)}
							{@const subComments = commentsFor('substitution', sub.id)}
							<li class="swap">
								<div class="swap__main">
									<button
										type="button"
										class="swap__choose"
										class:active={chosen?.id === sub.id}
										onclick={() => onchoose(sub.id)}
									>
										{sub.name}
										<span class="muted">
											— {formatQuantity(ingredient.quantity * sub.ratio)} {ingredient.unit}
										</span>
										{#if substitutionModerationStore.isRecognized(sub.id)}
											<span title={t('moderation.recognizedBadge')}>⭐</span>
										{/if}
									</button>
									<ReactionButtons reactions={sub.reactions} compact />
								</div>
								{#if sub.proposedBy}
									<a class="proposed-by" href={`/users/${sub.proposedBy.id}`}>
										{t('substitution.proposedBy', { name: sub.proposedBy.displayName })}
									</a>
								{/if}
								<!-- "alternatives to certain ingredients need to be able to be discussed" — each
								     swap keeps its own thread, collapsed, exactly as the recipe page rendered it
								     before this sheet existed. -->
								<details class="discussion">
									<summary>{t('comment.discussionToggle', { n: subComments.length })}</summary>
									{#each subComments as comment (comment.id)}
										<CommentItem {comment} context={{ recipeId, recipeName, targetLabel: sub.name }} />
									{/each}
									{#if authStore.hydrated && authStore.isAuthenticated}
										<CommentComposer
											onsubmit={(content, visibility, extras) =>
												onaddcomment('substitution', sub.id, content, visibility, extras)}
										/>
									{/if}
								</details>
							</li>
						{/each}
					</ul>
				{/if}
				{#if ingredient.substitutable && authStore.hydrated && authStore.isAuthenticated}
					<SubstitutionComposer onsubmit={(name, ratio) => onpropose(name, ratio)} />
				{/if}
			{:else if tab === 'notes'}
				{#if photos.length > 0}
					<div class="photo-strip">
						{#each photos as photo (photo.id)}
							<img src={photo.imageUrl} alt="" />
						{/each}
					</div>
				{/if}

				{#if stories.length > 0}
					<h3 class="sheet__sub">{t('ingredientSheet.storiesHeading')}</h3>
					{#each stories as story (story.id)}
						<CommentItem
							comment={story}
							context={{ recipeId, recipeName, targetLabel: ingredient.name }}
						/>
					{/each}
				{/if}

				<h3 class="sheet__sub">{t('ingredientSheet.notesHeading')}</h3>
				{#if notes.length === 0}
					<p class="muted">{t('ingredientSheet.noNotes')}</p>
				{/if}
				{#each notes as comment (comment.id)}
					<CommentItem
						{comment}
						context={{ recipeId, recipeName, targetLabel: ingredient.name }}
					/>
				{/each}

				{#if authStore.hydrated && authStore.isAuthenticated}
					<CommentComposer
						allowMedia
						allowStory
						{canUpload}
						onsubmit={(content, visibility, extras) =>
							onaddcomment('ingredient', ingredient.id, content, visibility, extras)}
					/>
				{:else if authStore.hydrated}
					<p class="muted">
						{t('comment.loginRequired')}
						<a href={`/login?redirectTo=${encodeURIComponent(`/recipes/${recipeId}`)}`}>
							{t('comment.loginLink')}
						</a>
					</p>
				{/if}
			{:else}
				<p class="muted">{t('ingredientSheet.planLede', { recipe: recipeName })}</p>

				<label class="field">
					{t('ingredientSheet.weekLabel')}
					<select bind:value={planWeek}>
						<option value={thisWeek}>
							{t('ingredientSheet.thisWeek')} ({formatShortDate(thisWeek)})
						</option>
						<option value={nextWeek}>
							{t('ingredientSheet.nextWeek')} ({formatShortDate(nextWeek)})
						</option>
					</select>
				</label>

				{#if weekPlans.length === 0}
					<p class="muted">{t('ingredientSheet.noPlanYet')}</p>
					<button type="button" class="btn btn--primary" onclick={createPlan}>
						{t('ingredientSheet.createPlan')}
					</button>
				{:else}
					<label class="field">
						{t('ingredientSheet.planLabel')}
						<select bind:value={planId}>
							{#each weekPlans as plan (plan.id)}
								<option value={plan.id}>{plan.name}</option>
							{/each}
						</select>
					</label>
					<label class="field">
						{t('ingredientSheet.dayLabel')}
						<select bind:value={planDay}>
							{#each weekDates(planWeek) as date (date)}
								<option value={date}>
									{weekdayLabel(date, uiLocaleStore.locale)} {formatShortDate(date)}
								</option>
							{/each}
						</select>
					</label>
					<label class="field">
						{t('ingredientSheet.slotLabel')}
						<select bind:value={planSlot}>
							{#each SLOTS as slot (slot)}
								<option value={slot}>{slotLabel(slot)}</option>
							{/each}
						</select>
					</label>
					<button type="button" class="btn btn--primary" onclick={addToPlan}>
						{t('ingredientSheet.addToPlan')}
					</button>
					{#if planAdded}
						<!-- The point of adding it, said explicitly: the shopping list is the plan minus the
						     pantry, so planning this recipe is what makes everything it needs — and nothing
						     already owned — show up there. -->
						<p class="ok">
							{t('ingredientSheet.addedToPlan')}
							<a href={`/shopping-list?week=${planWeek}`}>{t('nav.shoppingList')}</a>
						</p>
					{/if}
				{/if}
			{/if}
		</div>
	</div>
</div>

<style lang="scss">
	.sheet-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.4);
		display: flex;
		align-items: flex-end;
		justify-content: center;
		z-index: 200;

		@media (min-width: 640px) {
			align-items: center;
			padding: var(--space-4);
		}
	}
	// A bottom sheet on a phone (thumb-reachable, the posture this app is used in) and a centred
	// dialog on a wide screen — one component, two idioms, rather than a desktop modal squeezed
	// onto a phone.
	.sheet {
		background: var(--bg-surface);
		width: 100%;
		max-width: 520px;
		max-height: 88vh;
		display: flex;
		flex-direction: column;
		border-radius: var(--radius-card) var(--radius-card) 0 0;

		@media (min-width: 640px) {
			border-radius: var(--radius-card);
		}
		&:focus {
			outline: none;
		}
	}
	.sheet__head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-4) var(--space-2);

		h2 {
			margin: 0;
			font-size: 17px;
		}
	}
	.sheet__amount {
		margin: 2px 0 0;
		font-size: 13px;
		color: var(--text-secondary);
	}
	.sheet__swapped {
		color: var(--accent);
	}
	.sheet__close {
		background: none;
		border: none;
		font-size: 16px;
		cursor: pointer;
		color: var(--text-secondary);
	}
	.sheet__tabs {
		display: flex;
		gap: var(--space-1);
		padding: 0 var(--space-3);
		border-bottom: 1px solid var(--bg-surface-alt);
		overflow-x: auto;
	}
	.sheet__tab {
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		padding: var(--space-2) var(--space-2);
		font-family: inherit;
		font-size: 12px;
		color: var(--text-secondary);
		cursor: pointer;
		white-space: nowrap;

		&.active {
			color: var(--accent);
			border-bottom-color: var(--accent);
			font-weight: 600;
		}
	}
	.sheet__body {
		padding: var(--space-3) var(--space-4) var(--space-4);
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.sheet__sub {
		margin: var(--space-2) 0 0;
		font-size: 13px;
	}
	.status {
		margin: 0;
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-card);
		background: var(--bg-surface-alt);
		font-size: 13px;

		&--enough {
			color: var(--status-success);
		}
		&--partial,
		&--unresolved {
			color: var(--status-warning);
		}
	}
	.pantry-rows {
		margin: 0;
		padding-left: var(--space-4);
		font-size: 12px;
		color: var(--text-secondary);
	}
	.inline-form {
		display: flex;
		gap: var(--space-2);
		align-items: center;
		flex-wrap: wrap;

		input {
			padding: var(--space-2);
			border: 1px solid var(--bg-surface-alt);
			border-radius: var(--radius-card);
			font-family: inherit;
			font-size: 13px;
			width: 88px;
		}
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		font-size: 12px;
		color: var(--text-secondary);

		select {
			padding: var(--space-2);
			border: 1px solid var(--bg-surface-alt);
			border-radius: var(--radius-card);
			font-family: inherit;
			font-size: 13px;
			color: var(--text-primary);
		}
	}
	.swaps {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.swap__main {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}
	.swap__choose {
		background: none;
		border: none;
		padding: var(--space-1) 0;
		font-family: inherit;
		font-size: 13px;
		text-align: left;
		color: inherit;
		cursor: pointer;
		flex: 1;

		&.active {
			color: var(--accent);
			font-weight: 600;
		}
	}
	.proposed-by {
		font-size: 11px;
		color: var(--text-secondary);
		text-decoration: none;
	}
	.discussion {
		font-size: 12px;

		summary {
			cursor: pointer;
			color: var(--text-secondary);
		}
	}
	.photo-strip {
		display: flex;
		gap: var(--space-2);
		overflow-x: auto;

		img {
			height: 96px;
			border-radius: var(--radius-card);
			object-fit: cover;
		}
	}
	.muted {
		margin: 0;
		font-size: 13px;
		color: var(--text-secondary);
	}
	.ok {
		margin: 0;
		font-size: 12px;
		color: var(--status-success);

		a {
			color: var(--accent);
		}
	}
</style>
