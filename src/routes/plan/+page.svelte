<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import { mealPlanStore } from '$lib/state/mealPlan.svelte';
	import { profileStore } from '$lib/state/profile.svelte';
	import { uiLocaleStore } from '$lib/state/uiLocale.svelte';
	import { isRecipeCookable } from '$lib/utils/cookability';
	import { toISODate, mondayOf, addDays, weekDates, weekdayLabel, formatShortDate } from '$lib/utils/week';
	import { t } from '$lib/i18n/t';
	import type { MealSlotKind } from '$lib/types/pantry';
	import type { RecipeCard } from '$lib/types/recipe';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const SLOTS: MealSlotKind[] = ['breakfast', 'lunch', 'dinner', 'snack'];
	// $derived, not a plain const — carries translated labels, must react to a language switch.
	let SLOT_LABEL = $derived<Record<MealSlotKind, string>>({
		breakfast: t('plan.slot.breakfast'),
		lunch: t('plan.slot.lunch'),
		dinner: t('plan.slot.dinner'),
		snack: t('plan.slot.snack')
	});

	// Seeded once from `?week=` when arriving from the shopping list's own "plan this week first"
	// link (untrack'd — a deliberate one-time read, same convention 2do documents for exactly this
	// "prop/URL seeds initial edit state, doesn't stay synced after" shape). Navigating with the
	// page's own Prev/Next buttons is still plain local $state, not URL-synced on every click.
	let weekStart = $state(
		untrack(() => page.url.searchParams.get('week')) ?? toISODate(mondayOf(new Date()))
	);
	let days = $derived(weekDates(weekStart));

	// Session 24 — "allow more than 1 weekly plan": a week can now have zero, one, or several named
	// plans, so viewing a week alone no longer determines which plan's data is on screen.
	// `selectedPlanId` is seeded once from `?plan=` (same one-time convention `weekStart` above
	// already uses), then re-resolved by the $effect below whenever the viewed week changes or the
	// selected plan stops existing (deleted, or the week was just navigated away from) — falling
	// back to the first plan for the week, or `null` if the week genuinely has none yet.
	let selectedPlanId = $state<string | null>(untrack(() => page.url.searchParams.get('plan')));
	let plansThisWeek = $derived(mealPlanStore.plansForWeek(weekStart));
	$effect(() => {
		if (!plansThisWeek.some((p) => p.id === selectedPlanId)) {
			selectedPlanId = plansThisWeek[0]?.id ?? null;
		}
	});
	let plan = $derived(selectedPlanId ? mealPlanStore.planById(selectedPlanId) : undefined);

	function createPlan() {
		const id = mealPlanStore.createPlan(weekStart, t('plan.defaultName', { n: plansThisWeek.length + 1 }));
		selectedPlanId = id;
	}

	let renaming = $state(false);
	let renameInput = $state('');
	function startRename() {
		if (!plan) return;
		renameInput = plan.name;
		renaming = true;
	}
	function saveRename() {
		if (!plan) return;
		const trimmed = renameInput.trim();
		if (trimmed) mealPlanStore.renamePlan(plan.id, trimmed);
		renaming = false;
	}

	function duplicatePlanHere() {
		if (!plan) return;
		const id = mealPlanStore.duplicatePlan(plan.id, t('plan.copyName', { name: plan.name }));
		if (id) selectedPlanId = id;
	}

	let duplicateTargetWeek = $state('');
	let showDuplicateToWeek = $state(false);
	function duplicatePlanToWeek() {
		if (!plan || !duplicateTargetWeek) return;
		const targetMonday = toISODate(mondayOf(new Date(duplicateTargetWeek)));
		const id = mealPlanStore.duplicatePlan(plan.id, t('plan.copyName', { name: plan.name }), targetMonday);
		if (!id) return;
		weekStart = targetMonday;
		selectedPlanId = id;
		showDuplicateToWeek = false;
	}

	function deletePlan() {
		if (!plan) return;
		if (!confirm(t('plan.deleteConfirm', { name: plan.name }))) return;
		mealPlanStore.deletePlan(plan.id);
		selectedPlanId = null;
	}

	// Hardware is a hard filter here too, same as the home feed (CLAUDE.md 4.1) — no point letting
	// someone plan a recipe into their week that their kitchen can't actually make. Session 9 —
	// same equipment-alternative-aware reconciliation the home feed uses, see cookability.ts.
	let hardware = $derived(profileStore.profile?.hardware ?? null);
	let availableRecipes = $derived(data.recipes.filter((r) => isRecipeCookable(r, hardware)));

	function recipeById(id: string): RecipeCard | undefined {
		return data.recipes.find((r) => r.id === id);
	}

	/** A list, not a single optional meal (Session 23) — several meals can share one (date, slot)
	 *  cell. Empty whenever no plan is selected for this week yet. */
	function mealsAt(date: string, slot: MealSlotKind) {
		if (!plan) return [];
		return plan.days.find((d) => d.date === date)?.meals.filter((m) => m.slot === slot) ?? [];
	}

	// Deliberately NOT read from `plan` in the initializer — that only captures $derived's value
	// once, at declaration time (Svelte 5 flags this). The $effect below runs immediately on mount
	// and sets the real initial value, so starting from '' here is honest, not a placeholder.
	let budgetInput = $state<number | string>('');
	$effect(() => {
		// Reset the field whenever the viewed plan changes, so it never carries a stale value from
		// a different plan's own budget into this one.
		budgetInput = plan?.budget?.amount ?? '';
	});

	function saveBudget() {
		if (!plan) return;
		const amount = Number(budgetInput);
		mealPlanStore.setBudget(
			plan.id,
			Number.isFinite(amount) && amount > 0 ? { amount, currency: 'PLN' } : undefined
		);
	}

	// A flat per-meal-slot sum, not prorated by the servings stepper — Recipe has no `baseServings`
	// field yet to prorate against, so this deliberately doesn't pretend to scale cost with portion
	// count. Flagged honestly in CLAUDE.md rather than faking a per-serving number.
	let weekTotal = $derived(
		plan
			? plan.days.reduce(
					(sum, day) =>
						sum +
						day.meals.reduce(
							(daySum, meal) => daySum + (recipeById(meal.recipeId)?.costEstimate?.amount ?? 0),
							0
						),
					0
				)
			: 0
	);
	let overBudget = $derived(plan?.budget !== undefined && weekTotal > plan.budget.amount);

	// Same flat, not-prorated-by-servings honesty `weekTotal` above already carries — Recipe has no
	// `baseServings` field to scale a per-serving kcal figure against, so this sums each recipe's
	// own whole-recipe kcal once per meal, same as the cost total already does, not a fabricated
	// more-precise number the data doesn't actually support.
	function dayCalories(date: string): number {
		if (!plan) return 0;
		const day = plan.days.find((d) => d.date === date);
		if (!day) return 0;
		return day.meals.reduce((sum, meal) => sum + (recipeById(meal.recipeId)?.macros.kcal ?? 0), 0);
	}
	let weekCalories = $derived(days.reduce((sum, date) => sum + dayCalories(date), 0));

	let pickerTarget = $state<{ date: string; slot: MealSlotKind } | null>(null);

	function openPicker(date: string, slot: MealSlotKind) {
		pickerTarget = { date, slot };
	}
	function closePicker() {
		pickerTarget = null;
	}
	function pickRecipe(recipeId: string) {
		if (!pickerTarget || !plan) return;
		mealPlanStore.assign(plan.id, pickerTarget.date, pickerTarget.slot, recipeId);
		closePicker();
	}
	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) closePicker();
	}
	function handleBackdropKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' || e.key === 'Enter') closePicker();
	}

	function prevWeek() {
		weekStart = toISODate(addDays(mondayOf(new Date(weekStart)), -7));
	}
	function nextWeek() {
		weekStart = toISODate(addDays(mondayOf(new Date(weekStart)), 7));
	}
	function goToday() {
		weekStart = toISODate(mondayOf(new Date()));
	}

	// Deliberately NOT the AI Meal Planning Wizard (CLAUDE.md 6.2, blocked on a real backend/LLM
	// call) — a plain, deterministic round-robin fill over the hardware-filtered corpus, honestly
	// labeled in the UI as "prosty dobór," never "AI." Skips `snack` (breakfast/lunch/dinner only,
	// matching the founder's own "Panic Button"/"10-minute rescue meal" framing of snack slots as
	// an exception, not a default). Stops rather than overshoot the budget — the same honest
	// "Budget Reality Check" the AI Wizard's own spec calls for, borrowed early since it's just
	// arithmetic, not anything that needs a model.
	function quickFill() {
		if (!plan || availableRecipes.length === 0) return;
		let cursor = 0;
		let runningTotal = weekTotal;
		for (const date of days) {
			for (const slot of ['breakfast', 'lunch', 'dinner'] as const) {
				if (mealsAt(date, slot).length > 0) continue;
				let picked: RecipeCard | null = null;
				for (let attempts = 0; attempts < availableRecipes.length; attempts += 1) {
					const candidate = availableRecipes[cursor % availableRecipes.length];
					cursor += 1;
					const cost = candidate.costEstimate?.amount ?? 0;
					if (!plan.budget || runningTotal + cost <= plan.budget.amount) {
						picked = candidate;
						break;
					}
				}
				if (!picked) return;
				mealPlanStore.assign(plan.id, date, slot, picked.id);
				runningTotal += picked.costEstimate?.amount ?? 0;
			}
		}
	}

	function clearWeek() {
		if (!plan) return;
		for (const date of days) mealPlanStore.clearDay(plan.id, date);
	}
</script>

<svelte:head>
	<title>{t('plan.title')} — Foodia</title>
</svelte:head>

<svelte:window
	onkeydown={(e) => {
		if (pickerTarget && e.key === 'Escape') closePicker();
	}}
/>

<h1>{t('plan.title')}</h1>
<p class="lede">{t('plan.lede')}</p>

<div class="week-nav">
	<button class="btn btn--ghost" onclick={prevWeek}>&larr; {t('plan.prev')}</button>
	<strong>
		{formatShortDate(days[0])} – {formatShortDate(days[6])}
	</strong>
	<button class="btn btn--ghost" onclick={nextWeek}>{t('plan.next')} &rarr;</button>
	<button class="btn btn--ghost" onclick={goToday}>{t('plan.today')}</button>
</div>

<!-- Session 24 — "allow more than 1 weekly plan": tabs, not a single implicit plan per week. -->
<div class="plan-tabs">
	{#each plansThisWeek as p (p.id)}
		<button
			type="button"
			class="plan-tab"
			class:active={p.id === selectedPlanId}
			onclick={() => (selectedPlanId = p.id)}
		>
			{p.name}
		</button>
	{/each}
	<button type="button" class="plan-tab plan-tab--new" onclick={createPlan}>
		{t('plan.newPlan')}
	</button>
</div>

{#if plan}
	<div class="plan-toolbar">
		{#if renaming}
			<form
				class="rename-form"
				onsubmit={(e) => {
					e.preventDefault();
					saveRename();
				}}
			>
				<input type="text" bind:value={renameInput} />
				<button type="submit" class="btn btn--ghost btn--small">{t('plan.renameSave')}</button>
				<button type="button" class="btn btn--ghost btn--small" onclick={() => (renaming = false)}>
					{t('comment.cancel')}
				</button>
			</form>
		{:else}
			<button type="button" class="btn btn--ghost btn--small" onclick={startRename}>
				{t('plan.rename')}
			</button>
		{/if}
		<button type="button" class="btn btn--ghost btn--small" onclick={duplicatePlanHere}>
			{t('plan.duplicate')}
		</button>
		<details class="duplicate-to-week" bind:open={showDuplicateToWeek}>
			<summary class="btn btn--ghost btn--small">{t('plan.duplicateToWeek')}</summary>
			<div class="duplicate-to-week__form">
				<input type="date" bind:value={duplicateTargetWeek} />
				<button
					type="button"
					class="btn btn--primary btn--small"
					disabled={!duplicateTargetWeek}
					onclick={duplicatePlanToWeek}
				>
					{t('plan.duplicate')}
				</button>
			</div>
		</details>
		<button type="button" class="btn btn--ghost btn--small remove" onclick={deletePlan}>
			{t('plan.delete')}
		</button>
	</div>

	<div class="budget-bar">
		<label class="budget-field">
			{t('plan.budgetLabel')}
			<input
				type="number"
				min="0"
				placeholder={t('plan.budgetPlaceholder')}
				bind:value={budgetInput}
				onblur={saveBudget}
			/>
		</label>
		<span class="budget-total" class:over={overBudget}>
			{t('plan.sum')}: {weekTotal} PLN{#if plan.budget}
				&nbsp;/ {plan.budget.amount} PLN{/if}
		</span>
		<span class="week-kcal">🔥 {t('plan.weekKcal', { n: weekCalories })}</span>
	</div>

	{#if overBudget}
		<p class="reality-check">{t('plan.realityCheck')}</p>
	{/if}

	<div class="plan-actions">
		<button class="btn btn--primary" onclick={quickFill} disabled={availableRecipes.length === 0}>
			{t('plan.quickFill')}
		</button>
		<button class="btn btn--ghost" onclick={clearWeek}>{t('plan.clearWeek')}</button>
		<a class="btn btn--ghost" href={`/shopping-list?week=${weekStart}&plan=${plan.id}`}>
			{t('plan.shoppingListLink')}
		</a>
	</div>
	<p class="hint">{t('plan.quickFillHint')}</p>

	<div class="plan-grid">
		<div class="plan-grid__corner"></div>
		{#each days as date (date)}
			<div class="plan-grid__day-head">
				<span class="weekday">{weekdayLabel(date, uiLocaleStore.locale)}</span>
				<span class="date">{formatShortDate(date)}</span>
				<span class="day-kcal">🔥 {t('plan.kcal', { n: dayCalories(date) })}</span>
			</div>
		{/each}

		{#each SLOTS as slot (slot)}
			<div class="plan-grid__slot-head">{SLOT_LABEL[slot]}</div>
			{#each days as date (date)}
				{@const meals = mealsAt(date, slot)}
				<div class="plan-cell">
					<!-- Session 23 — "no limit on the amount of meals in the planner": every meal in this
					     slot gets its own chip, and the add button always renders alongside them, not
					     only when the cell is empty. -->
					{#each meals as meal (meal.id)}
						{@const recipe = recipeById(meal.recipeId)}
						{#if recipe}
							<div class="meal-chip">
								<a href={`/recipes/${recipe.id}`} class="meal-chip__name">{recipe.name}</a>
								<span class="meal-chip__meta">
									{#if recipe.costEstimate}{recipe.costEstimate.amount} PLN ·{/if}
									{recipe.timeMinutes} min · {recipe.macros.kcal} kcal
								</span>
								<div class="meal-chip__row">
									<label class="servings">
										👥
										<input
											type="number"
											min="1"
											max="10"
											value={meal.servings}
											onchange={(e) =>
												plan &&
												mealPlanStore.updateServings(
													plan.id,
													date,
													meal.id,
													Number(e.currentTarget.value) || 1
												)}
										/>
									</label>
									<button
										class="remove"
										onclick={() => plan && mealPlanStore.remove(plan.id, date, meal.id)}
									>
										{t('plan.removeMeal')}
									</button>
								</div>
							</div>
						{/if}
					{/each}
					<button class="plan-cell__add" onclick={() => openPicker(date, slot)}>
						{t('plan.addMeal')}
					</button>
				</div>
			{/each}
		{/each}
	</div>
{:else}
	<p class="empty">
		{t('plan.noPlanThisWeek')}
		<button type="button" class="btn btn--primary btn--small" onclick={createPlan}>
			{t('plan.newPlan')}
		</button>
	</p>
{/if}

{#if pickerTarget}
	{@const target = pickerTarget}
	<div
		class="picker-overlay"
		role="button"
		tabindex="0"
		aria-label={t('plan.pickerCloseAria')}
		onclick={handleBackdropClick}
		onkeydown={handleBackdropKeydown}
	>
		<div class="picker">
			<div class="picker__head">
				<h2>
					{t('plan.pickerTitle', { slot: SLOT_LABEL[target.slot], day: weekdayLabel(target.date, uiLocaleStore.locale) })}
				</h2>
				<button class="picker__close" onclick={closePicker} aria-label={t('plan.pickerClose')}>✕</button>
			</div>
			{#if availableRecipes.length === 0}
				<p>{t('plan.pickerEmpty')} <a href="/onboarding">{t('plan.pickerChangeProfile')}</a>.</p>
			{/if}
			<ul class="picker__list">
				{#each availableRecipes as recipe (recipe.id)}
					<li>
						<button class="picker__item" onclick={() => pickRecipe(recipe.id)}>
							<span class="picker__item-name">{recipe.name}</span>
							<span class="picker__item-meta">
								{#if recipe.costEstimate}{recipe.costEstimate.amount} PLN ·{/if}
								{recipe.timeMinutes} min · {recipe.macros.kcal} kcal
							</span>
						</button>
					</li>
				{/each}
			</ul>
		</div>
	</div>
{/if}

<style lang="scss">
	.lede {
		color: var(--text-secondary);
		margin-top: 0;
	}
	.week-nav {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin-bottom: var(--space-3);
	}
	.plan-tabs {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-bottom: var(--space-2);
	}
	.plan-tab {
		padding: var(--space-1) var(--space-3);
		border-radius: var(--radius-pill);
		border: 1px solid var(--bg-surface-alt);
		background: var(--bg-surface);
		color: var(--text-secondary);
		font-size: 13px;
		font-family: inherit;
		cursor: pointer;

		&.active {
			border-color: var(--accent);
			background: var(--accent-soft);
			color: var(--accent);
			font-weight: 600;
		}
		&--new {
			border-style: dashed;
		}
	}
	.plan-toolbar {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-bottom: var(--space-3);

		.remove {
			color: var(--status-danger);
		}
	}
	.btn--small {
		padding: var(--space-1) var(--space-3);
		font-size: 12px;
	}
	.rename-form {
		display: flex;
		align-items: center;
		gap: var(--space-2);

		input {
			padding: var(--space-1) var(--space-2);
			border-radius: var(--radius-card);
			border: 1px solid var(--bg-surface-alt);
			font-family: inherit;
			font-size: 13px;
		}
	}
	.duplicate-to-week {
		summary {
			cursor: pointer;
			list-style: none;

			&::-webkit-details-marker {
				display: none;
			}
		}
	}
	.duplicate-to-week__form {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-top: var(--space-2);

		input {
			padding: var(--space-1) var(--space-2);
			border-radius: var(--radius-card);
			border: 1px solid var(--bg-surface-alt);
			font-family: inherit;
			font-size: 13px;
		}
	}
	.empty {
		color: var(--text-secondary);
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}
	.budget-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: var(--space-3);
		margin-bottom: var(--space-2);
	}
	.budget-field {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: 13px;
		color: var(--text-secondary);

		input {
			width: 90px;
			padding: var(--space-1) var(--space-2);
			border-radius: var(--radius-card);
			border: 1px solid var(--bg-surface-alt);
			font-family: inherit;
		}
	}
	.budget-total {
		font-size: 14px;
		font-weight: 600;

		&.over {
			color: var(--status-danger);
		}
	}
	.week-kcal {
		font-size: 13px;
		color: var(--text-secondary);
	}
	.reality-check {
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-card);
		background: rgba(192, 57, 43, 0.1);
		color: var(--status-danger);
		font-size: 13px;
		margin-bottom: var(--space-3);
	}
	.plan-actions {
		display: flex;
		gap: var(--space-2);
		margin-bottom: var(--space-1);
	}
	.hint {
		font-size: 12px;
		color: var(--text-secondary);
		margin: 0 0 var(--space-4);
	}
	.plan-grid {
		display: grid;
		grid-template-columns: 90px repeat(7, minmax(120px, 1fr));
		gap: 1px;
		background: var(--bg-surface-alt);
		border-radius: var(--radius-card);
		overflow: hidden;
		overflow-x: auto;
	}
	.plan-grid__corner {
		background: var(--bg-surface);
	}
	.plan-grid__day-head {
		background: var(--bg-surface);
		padding: var(--space-2);
		text-align: center;
		display: flex;
		flex-direction: column;

		.weekday {
			font-weight: 600;
			font-size: 13px;
		}
		.date {
			font-size: 11px;
			color: var(--text-secondary);
		}
		.day-kcal {
			font-size: 11px;
			color: var(--text-secondary);
			margin-top: 2px;
		}
	}
	.plan-grid__slot-head {
		background: var(--bg-surface);
		padding: var(--space-2);
		font-size: 12px;
		font-weight: 600;
		color: var(--text-secondary);
		display: flex;
		align-items: center;
	}
	.plan-cell {
		background: var(--bg-surface);
		padding: var(--space-2);
		min-height: 64px;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.plan-cell__add {
		background: none;
		border: 1px dashed var(--bg-surface-alt);
		border-radius: var(--radius-card);
		padding: var(--space-2);
		color: var(--text-secondary);
		font-size: 12px;
		cursor: pointer;
		font-family: inherit;

		&:hover {
			border-color: var(--accent);
			color: var(--accent);
		}
	}
	.meal-chip {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
		font-size: 12px;
	}
	.meal-chip__name {
		font-weight: 600;
		color: var(--text-primary);
		text-decoration: none;

		&:hover {
			color: var(--accent);
		}
	}
	.meal-chip__meta {
		color: var(--text-secondary);
		font-size: 11px;
	}
	.meal-chip__row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: var(--space-1);
	}
	.servings {
		display: flex;
		align-items: center;
		gap: 2px;
		font-size: 11px;

		input {
			width: 34px;
			padding: 1px 2px;
			border-radius: 4px;
			border: 1px solid var(--bg-surface-alt);
			font-size: 11px;
			font-family: inherit;
		}
	}
	.remove {
		background: none;
		border: none;
		color: var(--status-danger);
		font-size: 11px;
		cursor: pointer;
		padding: 0;
		font-family: inherit;
	}

	.picker-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.4);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--space-4);
		z-index: 100;
	}
	.picker {
		background: var(--bg-surface);
		border-radius: var(--radius-card);
		padding: var(--space-4);
		max-width: 420px;
		width: 100%;
		max-height: 80vh;
		overflow-y: auto;
	}
	.picker__head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-2);
		margin-bottom: var(--space-3);

		h2 {
			font-size: 16px;
			margin: 0;
		}
	}
	.picker__close {
		background: none;
		border: none;
		font-size: 16px;
		cursor: pointer;
		color: var(--text-secondary);
	}
	.picker__list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.picker__item {
		width: 100%;
		text-align: left;
		background: var(--bg-surface-alt);
		border: none;
		border-radius: var(--radius-card);
		padding: var(--space-2) var(--space-3);
		cursor: pointer;
		font-family: inherit;

		&:hover {
			background: var(--accent-soft);
		}
	}
	.picker__item-name {
		display: block;
		font-weight: 600;
		font-size: 14px;
	}
	.picker__item-meta {
		display: block;
		font-size: 12px;
		color: var(--text-secondary);
		margin-top: 2px;
	}
</style>
