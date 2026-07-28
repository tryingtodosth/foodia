<script lang="ts">
	import type { RecipeDetail } from '$lib/types/recipe';
	import { t } from '$lib/i18n/t';
	import { profileStore } from '$lib/state/profile.svelte';
	import { sessionStepAlternativesStore } from '$lib/state/stepAlternatives.svelte';
	import { pickUsableAlternative, stepNeedsAlternative, missingEquipmentLabel } from '$lib/utils/stepAlternative';

	let { recipe }: { recipe: RecipeDetail } = $props();

	let steps = $derived([...recipe.steps].sort((a, b) => a.order - b.order));
	let currentIndex = $state(0);
	let currentStep = $derived(steps[currentIndex]);

	// Device/Equipment Alternatives (CLAUDE.md 4.1/4.2) — Cooking Mode auto-suggests the single
	// best-fitting alternative rather than presenting a browse/vote list (that's the recipe detail
	// page's own job, mid-cook is not the moment to compare options). `showOriginalInstead` is an
	// explicit escape hatch back to the base technique, reset every time the step changes so a
	// choice on one step never silently carries over to the next.
	//
	// Session 10 (Section 7 item 27) — `currentStepAlternatives` merges the fixture-loaded
	// alternatives with whatever the cook (or anyone else this session) already proposed for this
	// exact step on the recipe detail page, via `sessionStepAlternativesStore`. Before this, a
	// technique proposed on /recipes/[id] and then immediately cooked was invisible here — the two
	// routes had entirely independent, page-local session state.
	let hardware = $derived(profileStore.profile?.hardware ?? null);
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

	// Timer state — a plain in-page countdown. Reliable only while the tab stays foregrounded;
	// see CLAUDE.md Section 4.3 / 7 item 11 for why a backgrounded push notification is P2, not P1.
	let timerSecondsLeft = $state<number | null>(null);
	let timerRunning = $state(false);
	let timerFinished = $state(false);
	let timerHandle: ReturnType<typeof setInterval> | undefined;

	// Wake Lock — keeps the screen on for the whole cooking session. See Section 7 item 9:
	// browser support is inconsistent across WebViews, a Capacitor-native fallback is P2.
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
			if (timerHandle) clearInterval(timerHandle);
		};
	});

	function startTimer(minutes: number) {
		if (timerHandle) clearInterval(timerHandle);
		timerSecondsLeft = minutes * 60;
		timerFinished = false;
		timerRunning = true;
		timerHandle = setInterval(() => {
			if (timerSecondsLeft === null) return;
			timerSecondsLeft -= 1;
			if (timerSecondsLeft <= 0) {
				timerRunning = false;
				timerFinished = true;
				if (timerHandle) clearInterval(timerHandle);
			}
		}, 1000);
	}

	function dismissTimer() {
		timerSecondsLeft = null;
		timerRunning = false;
		timerFinished = false;
	}

	function formatTime(totalSeconds: number) {
		const m = Math.floor(totalSeconds / 60)
			.toString()
			.padStart(2, '0');
		const s = (totalSeconds % 60).toString().padStart(2, '0');
		return `${m}:${s}`;
	}

	function advance() {
		if (currentIndex < steps.length - 1) currentIndex += 1;
	}
	function goBack() {
		if (currentIndex > 0) currentIndex -= 1;
	}
	function handleTap(event: MouseEvent) {
		// Left third of the screen goes back, everything else advances — tap-anywhere navigation
		// per CLAUDE.md 4.3, without needing precise targets for a hand that isn't fully clean.
		const x = event.clientX;
		const width = window.innerWidth;
		if (x < width / 3) goBack();
		else advance();
	}
</script>

<div class="cooking" onclick={handleTap} role="button" tabindex="0" onkeydown={() => {}}>
	<div class="cooking__progress">
		{currentIndex + 1} / {steps.length}
		{#if wakeLockSupported}
			<span class="wake-indicator" class:active={wakeLockActive}>
				{wakeLockActive ? t('cooking.wakeActive') : t('cooking.wakePending')}
			</span>
		{/if}
	</div>

	{#if usingAlt}
		<div class="cooking__alt-badge" role="status" onclick={(e) => e.stopPropagation()}>
			<span>{t('stepAlternative.usingAlternative', { equipment: missingLabel ?? '' })}</span>
			<button onclick={() => (showOriginalInstead = true)}>{t('stepAlternative.viewOriginal')}</button>
		</div>
	{:else if needsAlt && missingLabel}
		<div class="cooking__equipment-warning" role="status" onclick={(e) => e.stopPropagation()}>
			{bestAlt === null && currentStepAlternatives.length > 0
				? t('stepAlternative.noneUsable')
				: t('stepAlternative.needsEquipment', { equipment: missingLabel })}
		</div>
	{/if}

	<p class="cooking__text">{displayText}</p>

	{#if displayDurationMinutes}
		{#if timerSecondsLeft === null}
			<button
				class="cooking__timer-btn"
				onclick={(e) => {
					e.stopPropagation();
					startTimer(displayDurationMinutes!);
				}}
			>
				{t('cooking.startTimer', { min: displayDurationMinutes })}
			</button>
		{:else}
			<div
				class="cooking__timer-active"
				class:finished={timerFinished}
				onclick={(e) => e.stopPropagation()}
				role="timer"
			>
				{#if timerFinished}
					<span>{t('cooking.timerDone')}</span>
					<button onclick={dismissTimer}>{t('cooking.turnOff')}</button>
				{:else}
					<span>⏲ {formatTime(timerSecondsLeft)}</span>
				{/if}
			</div>
		{/if}
	{/if}

	<div class="cooking__hint">{t('cooking.hint')}</div>
</div>

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
	.cooking__progress {
		position: absolute;
		top: var(--space-4);
		left: var(--space-4);
		right: var(--space-4);
		display: flex;
		justify-content: space-between;
		font-size: 14px;
		color: var(--text-secondary);
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
	.cooking__timer-btn {
		margin-top: var(--space-4);
		padding: var(--space-3) var(--space-5);
		font-size: 20px;
		border-radius: var(--radius-pill);
		border: none;
		background: var(--accent);
		color: white;
		cursor: pointer;
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
		}
	}
	.cooking__hint {
		position: absolute;
		bottom: var(--space-4);
		font-size: 13px;
		color: var(--text-secondary);
	}
</style>
