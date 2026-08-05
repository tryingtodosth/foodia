<script lang="ts">
	// The E-Grocery aggregation (CLAUDE.md 4.5). No `+page.server.ts` — the page's own core data,
	// the MealPlan, only exists client-side (localStorage), so there's nothing meaningful for a
	// server load to fetch ahead of time. Same "plain +page.svelte, store-driven" precedent 2do's
	// own /search-style routes already establish for pages whose data isn't server-fetchable.
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { mealPlanStore } from '$lib/state/mealPlan.svelte';
	import { pantryStore } from '$lib/state/pantry.svelte';
	import { ingredientDensityStore } from '$lib/state/ingredientDensity.svelte';
	import DensityPrompt from '$lib/components/shared/DensityPrompt.svelte';
	import { mockApiClient } from '$lib/api/mock';
	import { httpApiClient } from '$lib/api/http';

	// See vite.config.ts's own comment — this route has no +page.server.ts (by design, its core
	// data is client-only), so it can't learn which build target it's in from a server load the
	// way every other route already does. The Capacitor build is fully static — there's no
	// `/api/recipes` server route in that output at all, ever, so calling httpApiClient there
	// would just 404 — mockApiClient is the only architecturally honest choice for that target.
	const recipeApiClient = __IS_CAPACITOR__ ? mockApiClient : httpApiClient;
	import { aggregateIngredients, crossReferencePantry } from '$lib/utils/shoppingList';
	import { formatQuantity } from '$lib/utils/units';
	import { formatShoppingListText, copyToClipboard, exportToEGrocery } from '$lib/utils/shoppingExport';
	import { toISODate, mondayOf, addDays, formatShortDate } from '$lib/utils/week';
	import { t } from '$lib/i18n/t';
	import type { RecipeDetail } from '$lib/types/recipe';

	let weekStart = $derived(page.url.searchParams.get('week') ?? toISODate(mondayOf(new Date())));
	// Session 24 — a week can have several plans now, so `?week=` alone no longer picks one. A
	// `?plan=` id (carried through from /plan's own "Shopping list" link) selects a specific one;
	// absent that, the first plan for the week is a reasonable default rather than an error state —
	// matches how `/plan` itself falls back when no `?plan=` was given either.
	let planIdParam = $derived(page.url.searchParams.get('plan'));
	let plan = $derived(
		(planIdParam ? mealPlanStore.planById(planIdParam) : undefined) ??
			mealPlanStore.plansForWeek(weekStart)[0]
	);
	let weekDays = $derived([plan?.days[0]?.date ?? weekStart, plan?.days[6]?.date ?? weekStart]);

	let usedRecipeIds = $derived([
		...new Set((plan?.days ?? []).flatMap((d) => d.meals.map((m) => m.recipeId)))
	]);

	let recipesById = $state<Record<string, RecipeDetail>>({});
	let loading = $state(false);

	$effect(() => {
		const ids = usedRecipeIds;
		if (ids.length === 0) {
			recipesById = {};
			return;
		}
		loading = true;
		recipeApiClient.getManyDetails(ids).then((details) => {
			recipesById = Object.fromEntries(details.map((r) => [r.id, r]));
			loading = false;
		});
	});

	let aggregated = $derived(plan ? aggregateIngredients(plan, recipesById) : []);
	// Session 25 — real unit conversion (lib/utils/units.ts). `ingredientDensityStore.classFor` is
	// read here, inside this $derived's own evaluation, which is what makes classifying an
	// ingredient below correctly recompute this list — same reactive-through-a-function-call
	// tracking `uiLocaleStore.locale` already relies on elsewhere in this app.
	let shoppingItems = $derived(
		crossReferencePantry(aggregated, pantryStore.items, ingredientDensityStore.classFor)
	);
	let missingItems = $derived(shoppingItems.filter((i) => i.missingQuantity > 0));
	let coveredItems = $derived(shoppingItems.filter((i) => i.missingQuantity === 0 && i.pantryQuantity > 0));

	let listText = $derived(formatShoppingListText(missingItems, weekStart));

	function goWeek(newStart: string) {
		goto(`/shopping-list?week=${newStart}`);
	}
	function prevWeek() {
		goWeek(toISODate(addDays(mondayOf(new Date(weekStart)), -7)));
	}
	function nextWeek() {
		goWeek(toISODate(addDays(mondayOf(new Date(weekStart)), 7)));
	}
	function goToday() {
		goWeek(toISODate(mondayOf(new Date())));
	}

	let statusMessage = $state('');

	async function handleCopy() {
		const result = await copyToClipboard(listText);
		statusMessage = t(result === 'copied' ? 'shopping.status.copied' : 'shopping.status.copyFailed');
	}

	async function handleExport() {
		const result = await exportToEGrocery(listText);
		statusMessage = t(
			result === 'stub-copied' ? 'shopping.status.egroceryStubCopied' : 'shopping.status.egroceryStubFailed'
		);
	}

	function markBought(item: (typeof missingItems)[number]) {
		pantryStore.add({ ingredientName: item.name, quantity: item.missingQuantity, unit: item.unit });
	}
</script>

<svelte:head>
	<title>{t('shopping.title')} — Foodia</title>
</svelte:head>

<h1>{t('shopping.title')}</h1>
<p class="lede">
	{t('shopping.ledeStart')} <a href={`/plan?week=${weekStart}`}>{t('shopping.ledePlan')}</a>
	{t('shopping.ledeMiddle')} <a href="/pantry">{t('shopping.ledePantry')}</a>.
</p>

<div class="week-nav">
	<button class="btn btn--ghost" onclick={prevWeek}>&larr; {t('plan.prev')}</button>
	<strong>{formatShortDate(weekDays[0])} – {formatShortDate(weekDays[1])}</strong>
	<button class="btn btn--ghost" onclick={nextWeek}>{t('plan.next')} &rarr;</button>
	<button class="btn btn--ghost" onclick={goToday}>{t('plan.today')}</button>
</div>

{#if loading}
	<p class="loading">{t('shopping.loading')}</p>
{:else if usedRecipeIds.length === 0}
	<p class="empty">
		{t('shopping.emptyPlan')}
		<a href={`/plan?week=${weekStart}`}>{t('shopping.planFirst')}</a>.
	</p>
{:else}
	<section>
		<h2>{t('shopping.toBuy')} ({missingItems.length})</h2>
		{#if missingItems.length === 0}
			<p class="empty">{t('shopping.allCovered')}</p>
		{:else}
			<ul class="shopping-list">
				{#each missingItems as item (item.key)}
					<li class="shopping-item">
						<div class="shopping-item__main">
							<span class="shopping-item__qty">{formatQuantity(item.missingQuantity)} {item.unit}</span>
							<span class="shopping-item__name">{item.name}</span>
							{#if item.unitStatus === 'converted'}
								<span class="badge badge--converted" title={t('shopping.convertedTitle')}>
									{t('shopping.convertedBadge')}
								</span>
							{:else if item.unitStatus === 'incompatible'}
								<span class="badge" title={t('shopping.differentUnitTitle')}>
									{t('shopping.differentUnitBadge')}
								</span>
							{/if}
						</div>
						{#if item.unitStatus === 'needsDensity'}
							<!-- Session 25 — the real ask this closes: instead of a dead-end "can't compare,"
							     ask once, cache the answer per ingredient name, reuse it everywhere from then
							     on (ingredientDensityStore, lib/utils/units.ts's own header comment). Session 27
							     moved the markup into a shared component so the ingredient sheet asks the
							     identical question against the identical store. -->
							<DensityPrompt ingredientName={item.name} />
						{/if}
						<div class="shopping-item__meta">
							<span class="used-in">{t('shopping.usedIn', { names: item.usedInRecipeNames.join(', ') })}</span>
							<button class="btn btn--ghost btn--small" onclick={() => markBought(item)}>
								{t('shopping.markBought')}
							</button>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	{#if coveredItems.length > 0}
		<section>
			<h2>{t('shopping.alreadyHave')} ({coveredItems.length})</h2>
			<ul class="covered-list">
				{#each coveredItems as item (item.key)}
					<li>
						{item.name} — {formatQuantity(item.pantryQuantity)} {item.unit} ({t('shopping.neededLabel', {
							n: formatQuantity(item.neededQuantity),
							unit: item.unit
						})})
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if missingItems.length > 0}
		<section class="export">
			<h2>{t('shopping.export')}</h2>
			<div class="export-actions">
				<button class="btn btn--primary" onclick={handleCopy}>{t('shopping.copy')}</button>
				<button class="btn btn--ghost" onclick={handleExport}>{t('shopping.sendToStore')}</button>
			</div>
			{#if statusMessage}
				<p class="status">{statusMessage}</p>
			{/if}
			<details>
				<summary>{t('shopping.showAsText')}</summary>
				<textarea readonly rows="8">{listText}</textarea>
			</details>
		</section>
	{/if}
{/if}

<style lang="scss">
	.lede {
		color: var(--text-secondary);
		margin-top: 0;

		a {
			color: var(--accent);
		}
	}
	.week-nav {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin-bottom: var(--space-4);
	}
	.loading {
		color: var(--text-secondary);
	}
	.empty {
		color: var(--text-secondary);

		a {
			color: var(--accent);
		}
	}
	section {
		margin-bottom: var(--space-5);
	}
	section h2 {
		font-size: 16px;
		margin-bottom: var(--space-2);
	}
	.shopping-list {
		list-style: none;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.shopping-item {
		background: var(--bg-surface);
		border-radius: var(--radius-card);
		padding: var(--space-3);
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.shopping-item__main {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
	.shopping-item__qty {
		font-weight: 700;
		color: var(--accent);
	}
	.shopping-item__name {
		font-weight: 600;
	}
	.badge {
		font-size: 11px;
		padding: 2px 8px;
		border-radius: var(--radius-pill);
		background: var(--bg-surface-alt);
		color: var(--text-secondary);

		&--converted {
			background: var(--status-success);
			color: white;
		}
	}
	.shopping-item__meta {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
	.used-in {
		font-size: 12px;
		color: var(--text-secondary);
	}
	.btn--small {
		padding: var(--space-1) var(--space-3);
		font-size: 12px;
	}
	.covered-list {
		list-style: none;
		padding: 0;
		font-size: 13px;
		color: var(--text-secondary);
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.export-actions {
		display: flex;
		gap: var(--space-2);
		margin-bottom: var(--space-2);
	}
	.status {
		font-size: 13px;
		color: var(--text-secondary);
		margin-bottom: var(--space-2);
	}
	details {
		font-size: 13px;

		summary {
			cursor: pointer;
			color: var(--accent);
			margin-bottom: var(--space-2);
		}
		textarea {
			width: 100%;
			padding: var(--space-2);
			border-radius: var(--radius-card);
			border: 1px solid var(--bg-surface-alt);
			font-family: monospace;
			font-size: 12px;
		}
	}
</style>
