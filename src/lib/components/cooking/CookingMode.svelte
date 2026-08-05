<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import type { Ingredient, RecipeDetail, Substitution } from '$lib/types/recipe';
	import type { PantryItem } from '$lib/types/pantry';
	import type { CookingDeductionPlan } from '$lib/types/cooking';
	import { t } from '$lib/i18n/t';
	import { profileStore } from '$lib/state/profile.svelte';
	import { pantryStore } from '$lib/state/pantry.svelte';
	import { mealPlanStore } from '$lib/state/mealPlan.svelte';
	import { cookingSessionStore } from '$lib/state/cookingSession.svelte';
	import { ingredientDensityStore } from '$lib/state/ingredientDensity.svelte';
	import { sessionStepAlternativesStore } from '$lib/state/stepAlternatives.svelte';
	import { pickUsableAlternative, stepNeedsAlternative, missingEquipmentLabel } from '$lib/utils/stepAlternative';
	import { filterSafeSubstitutions, sortSubstitutionsByReaction } from '$lib/utils/substitution';
	import { effectiveIngredient, planPantryDeduction } from '$lib/utils/cookingDeduction';
	import { formatQuantity } from '$lib/utils/units';

	let { recipe }: { recipe: RecipeDetail } = $props();

	let steps = $derived([...recipe.steps].sort((a, b) => a.order - b.order));

	// --- The session ---------------------------------------------------------------------------
	// Cooking is a resumable ACTIVITY now, not a view (lib/state/cookingSession.svelte.ts). Step
	// position, finished steps, mid-recipe swaps and a running timer all live in that store, so
	// leaving this screen — a reload, a phone call, the back button, closing the tab — no longer
	// throws the whole thing away and starts over at step 1.
	let session = $derived(cookingSessionStore.forRecipe(recipe.id));
	$effect(() => {
		if (!cookingSessionStore.hydrated) return;
		// `untrack` because `start()` reads the sessions map it also writes — without it this effect
		// would re-run once for its own write. It's idempotent either way (an in-progress session is
		// resumed, never clobbered — see the store's own note on why that's the default), this just
		// avoids the pointless second pass.
		untrack(() =>
			cookingSessionStore.start({
				recipeId: recipe.id,
				recipeName: recipe.name,
				stepCount: steps.length
			})
		);
	});

	// Clamped rather than trusted: a session stored against an older version of this recipe could
	// name a step index that no longer exists. Before hydration this is 0 — the same one-tick lazy
	// hydration flash every localStorage-backed store in this app already documents, kept
	// deliberately over gating the whole screen, so the server-rendered first step stays real
	// content instead of a spinner.
	let currentIndex = $derived(Math.min(session?.stepIndex ?? 0, Math.max(0, steps.length - 1)));
	let currentStep = $derived(steps[currentIndex]);
	let doneCount = $derived(
		steps.filter((s) => session?.doneStepIds.includes(s.id)).length
	);

	/** `cooking` is the step-by-step screen; `review` is the deliberate stop between the last step
	 *  and touching anything (it shows exactly what will come off the pantry); `done` reports what
	 *  actually happened. The middle phase is the point — FUTURES.md Section 1 specs the deduction
	 *  as happening "immediately, in the background", which collides head-on with this app's own
	 *  rule against silently rewriting a cook's own data. A preview they confirm satisfies both. */
	let phase = $state<'cooking' | 'review' | 'done'>('cooking');

	// --- Equipment alternatives (unchanged behaviour, CLAUDE.md 4.3/4.9) -------------------------
	// Cooking Mode auto-substitutes the single best-fitting alternative rather than offering a browse
	// list — mid-cook is not the moment to compare options. `showOriginalInstead` is the escape
	// hatch, reset on every step change so a choice never silently carries into the next step.
	let hardware = $derived(profileStore.profile?.hardware ?? null);
	let allergies = $derived(profileStore.profile?.diet.allergies ?? []);
	let needsAlt = $derived(stepNeedsAlternative(currentStep, hardware));
	let currentStepAlternatives = $derived([
		...(currentStep.alternatives ?? []),
		...sessionStepAlternativesStore.forRecipe(recipe.id).filter((a) => a.forStepId === currentStep.id)
	]);
	let bestAlt = $derived(pickUsableAlternative(currentStepAlternatives, hardware));
	let showOriginalInstead = $state(false);
	$effect(() => {
		currentIndex;
		showOriginalInstead = false;
	});
	let usingAlt = $derived(needsAlt && bestAlt !== null && !showOriginalInstead);
	let displayText = $derived(usingAlt ? bestAlt!.text : currentStep.text);
	let displayDurationMinutes = $derived(
		usingAlt ? (bestAlt!.durationMinutes ?? currentStep.durationMinutes) : currentStep.durationMinutes
	);
	let missingLabel = $derived(missingEquipmentLabel(currentStep.requiresEquipment ?? [], hardware));

	// --- The step's own ingredients, and mid-recipe swaps ----------------------------------------
	// `Step.ingredientIds` has been in the type since Section 3; Cooking Mode never rendered it, which
	// is why "I substituted X" had nowhere to live here and why CLAUDE.md Section 7 item 27 left
	// ingredient substitutions out of the cross-route treatment step alternatives got ("Cooking Mode
	// doesn't render ingredients at all yet... worth doing the identical fix the moment that feature
	// exists"). It exists now, so the swap a cook picks on the recipe page seeds this session, and a
	// swap decided at the stove is recorded here — and both feed the pantry deduction at the end.
	let stepIngredients = $derived(
		currentStep.ingredientIds
			.map((id) => recipe.ingredients.find((i) => i.id === id))
			.filter((i): i is Ingredient => i !== undefined)
	);

	let swapPickerIngredientId = $state<string | null>(null);
	$effect(() => {
		currentIndex;
		swapPickerIngredientId = null;
	});
	let swapPickerIngredient = $derived(
		swapPickerIngredientId ? (recipe.ingredients.find((i) => i.id === swapPickerIngredientId) ?? null) : null
	);
	/** The allergy hard guardrail applies here exactly as it does on the recipe page (CLAUDE.md 4.1 /
	 *  Section 7 item 2) — this is a second surface that renders substitutions, so it needs its own
	 *  call to the same one filter, not an assumption that something upstream already ran it. */
	let swapOptions = $derived<Substitution[]>(
		swapPickerIngredient
			? sortSubstitutionsByReaction(
					filterSafeSubstitutions(swapPickerIngredient.substitutions ?? [], allergies)
				)
			: []
	);

	function chooseSwap(ingredientId: string, sub: Substitution | null) {
		cookingSessionStore.recordSubstitution(
			recipe.id,
			ingredientId,
			sub ? { ingredientId, substitutionId: sub.id, name: sub.name, ratio: sub.ratio } : null
		);
		swapPickerIngredientId = null;
	}

	// --- Timer ----------------------------------------------------------------------------------
	// Stored on the session as an absolute end time, not a ticking countdown — see CookingTimer's own
	// note for both reasons (a countdown can't survive a reload, and a `-= 1` interval under-counts
	// whenever a mobile browser throttles a backgrounded tab). Still doesn't RING in the background:
	// that needs Capacitor Local Notifications, unchanged (Section 7 item 11).
	let now = $state(Date.now());
	$effect(() => {
		if (!session?.timer) return;
		const handle = setInterval(() => (now = Date.now()), 500);
		return () => clearInterval(handle);
	});
	let timerSecondsLeft = $derived(
		session?.timer ? Math.max(0, Math.ceil((Date.parse(session.timer.endsAt) - now) / 1000)) : null
	);
	let timerFinished = $derived(timerSecondsLeft !== null && timerSecondsLeft <= 0);
	/** A timer started on step 3 stays visible on step 4 — the pot is still on the hob regardless of
	 *  what the cook is reading. Only one runs at a time, same as before. */
	let timerIsForAnotherStep = $derived(
		session?.timer !== undefined && session.timer.stepId !== currentStep.id
	);

	function startTimer(minutes: number) {
		cookingSessionStore.startTimer(recipe.id, {
			stepId: currentStep.id,
			endsAt: new Date(Date.now() + minutes * 60_000).toISOString(),
			totalMinutes: minutes
		});
		now = Date.now();
	}

	function dismissTimer() {
		cookingSessionStore.clearTimer(recipe.id);
	}

	function formatTime(totalSeconds: number) {
		const m = Math.floor(totalSeconds / 60)
			.toString()
			.padStart(2, '0');
		const s = (totalSeconds % 60).toString().padStart(2, '0');
		return `${m}:${s}`;
	}

	// --- Wake Lock (unchanged, Section 7 item 9) ------------------------------------------------
	let wakeLock: WakeLockSentinel | null = null;
	let wakeLockSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
	let wakeLockActive = $state(false);

	async function requestWakeLock() {
		if (!wakeLockSupported) return;
		try {
			wakeLock = await navigator.wakeLock.request('screen');
			wakeLockActive = true;
			wakeLock.addEventListener('release', () => {
				wakeLockActive = false;
			});
		} catch {
			wakeLockActive = false;
		}
	}

	$effect(() => {
		requestWakeLock();
		return () => {
			wakeLock?.release();
		};
	});

	// --- Navigation -----------------------------------------------------------------------------
	function advance() {
		if (currentIndex < steps.length - 1) {
			cookingSessionStore.goToStep(recipe.id, currentIndex + 1, currentStep.id);
		} else {
			// The last step used to be a dead end — `advance()` simply did nothing, so a finished
			// recipe and an unfinished one looked identical and nothing downstream ever learned that
			// the cooking had happened. Tapping onward now ends the session properly.
			cookingSessionStore.setStepDone(recipe.id, currentStep.id, true);
			phase = 'review';
		}
	}
	function goBack() {
		if (currentIndex > 0) cookingSessionStore.goToStep(recipe.id, currentIndex - 1);
	}
	function handleTap(event: MouseEvent) {
		// Left third of the screen goes back, everything else advances — tap-anywhere navigation
		// per CLAUDE.md 4.3, without needing precise targets for a hand that isn't fully clean.
		// Suspended while the swap picker is open, so choosing a swap can't also skip a step.
		if (swapPickerIngredientId !== null) return;
		const x = event.clientX;
		const width = window.innerWidth;
		if (x < width / 3) goBack();
		else advance();
	}

	/** Leaves the session exactly where it is — the whole point of it being persisted. */
	function leaveForNow() {
		goto(`/recipes/${recipe.id}`);
	}

	// --- Finishing: the pantry deduction ---------------------------------------------------------
	let deductionPlan = $derived<CookingDeductionPlan>(
		planPantryDeduction(
			recipe.ingredients,
			session?.substitutions ?? {},
			pantryStore.items,
			ingredientDensityStore.classFor
		)
	);

	// Snapshotted at confirm time rather than read from `deductionPlan` afterwards: the moment the
	// pantry is written, that derived value recomputes against the NEW pantry and would report
	// nothing to deduct — i.e. the results screen would erase its own evidence.
	let applied = $state<CookingDeductionPlan | null>(null);
	let consumedSnapshot = $state<PantryItem[]>([]);
	let deductionUndone = $state(false);
	let skippedDeduction = $state(false);

	function completeSession() {
		cookingSessionStore.finish(recipe.id);
		const context = session?.planContext;
		if (context) mealPlanStore.markCooked(context.planId, context.date, context.mealId, true);
		phase = 'done';
	}

	function confirmDeduction() {
		const plan = deductionPlan;
		consumedSnapshot = pantryStore.consume(plan.deductions);
		applied = plan;
		completeSession();
	}

	function finishWithoutDeduction() {
		applied = { deductions: [], shortfalls: deductionPlan.shortfalls };
		skippedDeduction = true;
		completeSession();
	}

	function undoDeduction() {
		pantryStore.restoreConsumed(consumedSnapshot);
		consumedSnapshot = [];
		deductionUndone = true;
	}

	/** Ends the session for real — everything before this point is resumable, this is the one action
	 *  that throws it away. */
	function closeSession() {
		cookingSessionStore.discard(recipe.id);
		goto(`/recipes/${recipe.id}`);
	}
</script>

{#if phase === 'cooking'}
	<div class="cooking" onclick={handleTap} role="button" tabindex="0" onkeydown={() => {}}>
		<div class="cooking__progress">
			<span>
				{currentIndex + 1} / {steps.length}
				{#if doneCount > 0}<span class="done-count">· {t('cooking.doneCount', { n: doneCount })}</span>{/if}
			</span>
			<span class="cooking__progress-right">
				{#if wakeLockSupported}
					<span class="wake-indicator" class:active={wakeLockActive}>
						{wakeLockActive ? t('cooking.wakeActive') : t('cooking.wakePending')}
					</span>
				{/if}
				<button
					class="cooking__exit"
					title={t('cooking.leave')}
					aria-label={t('cooking.leave')}
					onclick={(e) => {
						e.stopPropagation();
						leaveForNow();
					}}
				>
					✕
				</button>
			</span>
		</div>

		{#if usingAlt}
			<div class="cooking__alt-badge" role="status">
				<span>{t('stepAlternative.usingAlternative', { equipment: missingLabel ?? '' })}</span>
				<button
					onclick={(e) => {
						e.stopPropagation();
						showOriginalInstead = true;
					}}
				>
					{t('stepAlternative.viewOriginal')}
				</button>
			</div>
		{:else if needsAlt && missingLabel}
			<div class="cooking__equipment-warning" role="status">
				{bestAlt === null && currentStepAlternatives.length > 0
					? t('stepAlternative.noneUsable')
					: t('stepAlternative.needsEquipment', { equipment: missingLabel })}
			</div>
		{/if}

		<p class="cooking__text">{displayText}</p>

		{#if stepIngredients.length > 0}
			<!-- Tap an ingredient to record that you used something else instead. Buttons, not a
			     wrapper with its own click handler, so each one can stop the tap-to-advance from
			     firing behind it without adding a click listener to a non-interactive element. -->
			<div class="cooking__ingredients">
				{#each stepIngredients as ingredient (ingredient.id)}
					{@const used = effectiveIngredient(ingredient, session?.substitutions ?? {})}
					<button
						class="ing-chip"
						class:swapped={used.swappedFrom !== null}
						onclick={(e) => {
							e.stopPropagation();
							swapPickerIngredientId = ingredient.id;
						}}
					>
						<span class="ing-chip__qty">{formatQuantity(used.quantity)} {used.unit}</span>
						<span class="ing-chip__name">{used.name}</span>
						{#if used.swappedFrom}
							<span class="ing-chip__from">{t('cooking.insteadOf', { name: used.swappedFrom })}</span>
						{/if}
					</button>
				{/each}
			</div>
		{/if}

		{#if session?.timer && timerSecondsLeft !== null}
			<div class="cooking__timer-active" class:finished={timerFinished} role="timer">
				{#if timerFinished}
					<span>{t('cooking.timerDone')}</span>
					<button
						onclick={(e) => {
							e.stopPropagation();
							dismissTimer();
						}}
					>
						{t('cooking.turnOff')}
					</button>
				{:else}
					<span>⏲ {formatTime(timerSecondsLeft)}</span>
					{#if timerIsForAnotherStep}
						<span class="timer-origin">{t('cooking.timerFromOtherStep')}</span>
					{/if}
				{/if}
			</div>
		{:else if displayDurationMinutes}
			<button
				class="cooking__timer-btn"
				onclick={(e) => {
					e.stopPropagation();
					startTimer(displayDurationMinutes!);
				}}
			>
				{t('cooking.startTimer', { min: displayDurationMinutes })}
			</button>
		{/if}

		{#if currentIndex === steps.length - 1}
			<button
				class="cooking__finish-btn"
				onclick={(e) => {
					e.stopPropagation();
					cookingSessionStore.setStepDone(recipe.id, currentStep.id, true);
					phase = 'review';
				}}
			>
				{t('cooking.finish')}
			</button>
		{/if}

		<div class="cooking__hint">{t('cooking.hint')}</div>

		{#if swapPickerIngredient}
			{@const target = swapPickerIngredient}
			<div class="swap-sheet" role="dialog" aria-label={t('cooking.swapTitle', { name: target.name })}>
				<h2>{t('cooking.swapTitle', { name: target.name })}</h2>
				{#if swapOptions.length === 0}
					<p class="swap-sheet__empty">{t('cooking.swapNone')}</p>
				{:else}
					<ul class="swap-sheet__list">
						{#each swapOptions as sub (sub.id)}
							<li>
								<button
									class="swap-option"
									class:chosen={session?.substitutions[target.id]?.substitutionId === sub.id}
									onclick={(e) => {
										e.stopPropagation();
										chooseSwap(target.id, sub);
									}}
								>
									<span class="swap-option__name">{sub.name}</span>
									<span class="swap-option__ratio">
										{formatQuantity(target.quantity * sub.ratio)} {target.unit}
									</span>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
				<div class="swap-sheet__actions">
					{#if session?.substitutions[target.id]}
						<button
							class="btn-ghost"
							onclick={(e) => {
								e.stopPropagation();
								chooseSwap(target.id, null);
							}}
						>
							{t('cooking.swapUseOriginal')}
						</button>
					{/if}
					<button
						class="btn-ghost"
						onclick={(e) => {
							e.stopPropagation();
							swapPickerIngredientId = null;
						}}
					>
						{t('cooking.swapClose')}
					</button>
				</div>
			</div>
		{/if}
	</div>
{:else}
	<div class="cooking cooking--sheet">
		<div class="finish">
			{#if phase === 'review'}
				<h1>{t('cooking.reviewTitle')}</h1>
				<p class="finish__lede">{t('cooking.reviewLede')}</p>

				{#if deductionPlan.deductions.length === 0}
					<p class="finish__empty">{t('cooking.nothingToDeduct')}</p>
				{:else}
					<ul class="finish__list">
						{#each deductionPlan.deductions as d (d.pantryItemId + d.ingredientName)}
							<li>
								<strong>−{formatQuantity(d.quantity)} {d.unit}</strong>
								{d.ingredientName}
							</li>
						{/each}
					</ul>
				{/if}

				{#if deductionPlan.shortfalls.length > 0}
					<div class="finish__warnings">
						{#each deductionPlan.shortfalls as s (s.ingredientName + s.reason)}
							<p class="warning" class:warning--unresolved={s.reason === 'unresolved'}>
								{s.reason === 'short'
									? t('cooking.shortOn', {
											name: s.ingredientName,
											n: formatQuantity(s.missingQuantity),
											unit: s.unit
										})
									: t('cooking.unresolvedFor', { name: s.ingredientName })}
							</p>
						{/each}
					</div>
				{/if}

				<div class="finish__actions">
					<button class="btn-primary" onclick={confirmDeduction}>{t('cooking.confirmDeduct')}</button>
					<button class="btn-ghost" onclick={finishWithoutDeduction}>{t('cooking.skipDeduct')}</button>
					<button class="btn-ghost" onclick={() => (phase = 'cooking')}>{t('cooking.backToSteps')}</button>
				</div>
			{:else}
				<h1>{t('cooking.doneTitle')}</h1>
				{#if session?.planContext}
					<p class="finish__planned">{t('cooking.markedCooked')}</p>
				{/if}

				{#if skippedDeduction}
					<p class="finish__empty">{t('cooking.skippedDeduct')}</p>
				{:else if deductionUndone}
					<p class="finish__empty">{t('cooking.deductionUndone')}</p>
				{:else if applied && applied.deductions.length > 0}
					<h2>{t('cooking.deductedHeading')}</h2>
					<ul class="finish__list">
						{#each applied.deductions as d (d.pantryItemId + d.ingredientName)}
							<li>
								<strong>−{formatQuantity(d.quantity)} {d.unit}</strong>
								{d.ingredientName}
							</li>
						{/each}
					</ul>
					<button class="btn-ghost" onclick={undoDeduction}>{t('cooking.undoDeduction')}</button>
				{:else}
					<p class="finish__empty">{t('cooking.nothingToDeduct')}</p>
				{/if}

				{#if applied && applied.shortfalls.length > 0}
					<div class="finish__warnings">
						{#each applied.shortfalls as s (s.ingredientName + s.reason)}
							<p class="warning" class:warning--unresolved={s.reason === 'unresolved'}>
								{s.reason === 'short'
									? t('cooking.shortOn', {
											name: s.ingredientName,
											n: formatQuantity(s.missingQuantity),
											unit: s.unit
										})
									: t('cooking.unresolvedFor', { name: s.ingredientName })}
							</p>
						{/each}
					</div>
				{/if}

				<div class="finish__actions">
					<button class="btn-primary" onclick={closeSession}>{t('cooking.close')}</button>
					<a class="btn-ghost" href="/pantry">{t('cooking.openPantry')}</a>
					<a class="btn-ghost" href="/shopping-list">{t('cooking.openShoppingList')}</a>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style lang="scss">
	.cooking {
		position: fixed;
		inset: 0;
		background: var(--bg-page);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: var(--space-6);
		text-align: center;
		cursor: pointer;
		user-select: none;
	}
	.cooking--sheet {
		cursor: default;
		user-select: auto;
		overflow-y: auto;
		justify-content: flex-start;
		padding: var(--space-5) var(--space-4);
	}
	.cooking__progress {
		position: absolute;
		top: var(--space-4);
		left: var(--space-4);
		right: var(--space-4);
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 14px;
		color: var(--text-secondary);
	}
	.cooking__progress-right {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}
	.done-count {
		color: var(--status-success);
	}
	.cooking__exit {
		background: none;
		border: none;
		color: var(--text-secondary);
		font-size: 20px;
		line-height: 1;
		cursor: pointer;
		padding: 0 var(--space-1);
		font-family: inherit;

		&:hover {
			color: var(--text-primary);
		}
	}
	.wake-indicator.active {
		color: var(--status-success);
	}
	.cooking__alt-badge,
	.cooking__equipment-warning {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin-bottom: var(--space-3);
		padding: var(--space-1) var(--space-3);
		border-radius: var(--radius-pill);
		font-size: 14px;
		color: white;
		cursor: default;
	}
	.cooking__alt-badge {
		background: var(--accent);

		button {
			background: none;
			border: 1px solid white;
			border-radius: var(--radius-pill);
			color: white;
			padding: 2px 10px;
			font-size: 13px;
			cursor: pointer;
			font-family: inherit;
		}
	}
	.cooking__equipment-warning {
		background: var(--status-warning);
	}
	.cooking__text {
		font-size: clamp(28px, 6vw, 56px);
		font-weight: 600;
		line-height: 1.3;
		max-width: 720px;
	}
	.cooking__ingredients {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		justify-content: center;
		margin-top: var(--space-3);
		max-width: 720px;
	}
	.ing-chip {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-pill);
		border: 1px solid var(--bg-surface-alt);
		background: var(--bg-surface);
		font-family: inherit;
		font-size: 15px;
		cursor: pointer;
		color: var(--text-primary);

		&.swapped {
			border-color: var(--accent);
			background: var(--accent-soft);
		}
	}
	.ing-chip__qty {
		font-weight: 700;
		color: var(--accent);
	}
	.ing-chip__from {
		font-size: 12px;
		color: var(--text-secondary);
	}
	.cooking__timer-btn,
	.cooking__finish-btn {
		margin-top: var(--space-4);
		padding: var(--space-3) var(--space-5);
		font-size: 20px;
		border-radius: var(--radius-pill);
		border: none;
		background: var(--accent);
		color: white;
		cursor: pointer;
		font-family: inherit;
	}
	.cooking__finish-btn {
		background: var(--status-success);
	}
	.cooking__timer-active {
		margin-top: var(--space-4);
		font-size: 32px;
		font-weight: 700;
		display: flex;
		align-items: center;
		gap: var(--space-3);

		&.finished {
			color: var(--status-danger);
		}

		button {
			font-size: 16px;
			padding: var(--space-2) var(--space-3);
			border-radius: var(--radius-pill);
			border: none;
			background: var(--status-danger);
			color: white;
			cursor: pointer;
			font-family: inherit;
		}
	}
	.timer-origin {
		font-size: 13px;
		font-weight: 400;
		color: var(--text-secondary);
	}
	.cooking__hint {
		position: absolute;
		bottom: var(--space-4);
		font-size: 13px;
		color: var(--text-secondary);
	}

	.swap-sheet {
		position: absolute;
		left: 50%;
		bottom: 0;
		transform: translateX(-50%);
		width: min(520px, 100%);
		background: var(--bg-surface);
		border-radius: var(--radius-card) var(--radius-card) 0 0;
		padding: var(--space-4);
		text-align: left;
		box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.18);
		cursor: default;
		max-height: 70vh;
		overflow-y: auto;

		h2 {
			font-size: 16px;
			margin: 0 0 var(--space-3);
		}
	}
	.swap-sheet__empty {
		font-size: 14px;
		color: var(--text-secondary);
	}
	.swap-sheet__list {
		list-style: none;
		padding: 0;
		margin: 0 0 var(--space-3);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.swap-option {
		width: 100%;
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-card);
		border: 1px solid var(--bg-surface-alt);
		background: var(--bg-surface-alt);
		font-family: inherit;
		font-size: 15px;
		cursor: pointer;
		color: var(--text-primary);

		&.chosen {
			border-color: var(--accent);
			background: var(--accent-soft);
		}
	}
	.swap-option__name {
		font-weight: 600;
	}
	.swap-option__ratio {
		font-size: 13px;
		color: var(--text-secondary);
	}
	.swap-sheet__actions {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
	}

	.finish {
		width: min(560px, 100%);
		margin: 0 auto;
		text-align: left;

		h1 {
			font-size: 28px;
			margin: 0 0 var(--space-2);
		}
		h2 {
			font-size: 15px;
			margin: var(--space-4) 0 var(--space-2);
			color: var(--text-secondary);
		}
	}
	.finish__lede,
	.finish__empty,
	.finish__planned {
		color: var(--text-secondary);
		font-size: 14px;
	}
	.finish__planned {
		color: var(--status-success);
	}
	.finish__list {
		list-style: none;
		padding: 0;
		margin: var(--space-2) 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		font-size: 15px;

		strong {
			color: var(--accent);
			margin-right: var(--space-2);
		}
	}
	.finish__warnings {
		margin: var(--space-3) 0;
	}
	.warning {
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-card);
		background: rgba(192, 57, 43, 0.1);
		color: var(--status-danger);
		font-size: 13px;
		margin: 0 0 var(--space-2);

		&--unresolved {
			background: var(--bg-surface-alt);
			color: var(--text-secondary);
		}
	}
	.finish__actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-top: var(--space-4);
	}
	.btn-primary,
	.btn-ghost {
		padding: var(--space-2) var(--space-4);
		border-radius: var(--radius-pill);
		font-family: inherit;
		font-size: 14px;
		cursor: pointer;
		text-decoration: none;
		display: inline-block;
	}
	.btn-primary {
		border: none;
		background: var(--accent);
		color: white;
	}
	.btn-ghost {
		border: 1px solid var(--bg-surface-alt);
		background: none;
		color: var(--text-secondary);
	}
</style>
