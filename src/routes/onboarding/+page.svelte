<script lang="ts">
	import { goto } from '$app/navigation';
	import { profileStore } from '$lib/state/profile.svelte';
	import { buildDataExport, downloadDataExport, hasExportableData } from '$lib/utils/dataExport';
	import { t } from '$lib/i18n/t';
	import type { DietProfile, HardwareProfile, UserProfile } from '$lib/types/user';

	// User Context Engine's onboarding (CLAUDE.md 4.1) — a real, deliberate exception to
	// "Progressive Profiling" everywhere else in this app: this is the one form the app ever
	// asks the user to fill in directly, since something has to seed the profile in the first
	// place. Revisiting this page after a profile already exists pre-fills every field from it —
	// a judgment call (not explicitly speced) making this double as the "edit profile" entry
	// point, flagged in CLAUDE.md Section 7 rather than silently assumed.
	//
	// QA pass (STORIES.md S20) caught this reading profileStore.profile synchronously as a plain
	// const, which runs before the root layout's own $effect calls profileStore.hydrate() on a
	// fresh full page load (as opposed to an in-app client-side navigation, where hydration has
	// already happened earlier in the tab's lifetime) — on a real returning visitor's first hit of
	// /onboarding in a session, `existing` was always null, silently defaulting every field blank
	// and, worse, silently overwriting their real saved profile with those defaults the moment
	// they clicked "Gotowe" without noticing. Gated on profileStore.hydrated instead, the same flag
	// this store already exposes for exactly this purpose, and only seeds once so it never clobbers
	// an in-progress edit.
	let existing = $state<UserProfile | null>(null);
	let seededFromProfile = $state(false);
	// "Download my data" (CLAUDE.md Section 7 item 22 / FUTURES.md 9.3) — computed once in this
	// same post-hydration effect, not read at module/component init for the identical reason
	// `existing` above needs the effect: reading localStorage before hydrate() has run on a fresh
	// page load would wrongly report "nothing to download" for a returning visitor who has real,
	// saved data.
	let hasData = $state(false);
	$effect(() => {
		if (profileStore.hydrated && !seededFromProfile) {
			existing = profileStore.profile;
			if (existing) {
				diet = existing.diet.diet;
				allergiesText = existing.diet.allergies.join(', ');
				goals = existing.diet.goals;
				hardware = existing.hardware;
			}
			hasData = hasExportableData(buildDataExport());
			seededFromProfile = true;
		}
	});

	function handleDownloadData() {
		downloadDataExport(buildDataExport());
	}

	// $derived, not a plain const — these carry translated labels, so they need to recompute when
	// the interface language changes, not just once at component creation.
	let DIET_OPTIONS = $derived([
		{ value: 'omnivore', label: t('onboarding.diet.omnivore') },
		{ value: 'vegetarian', label: t('onboarding.diet.vegetarian') },
		{ value: 'vegan', label: t('onboarding.diet.vegan') },
		{ value: 'keto', label: t('onboarding.diet.keto') }
	]);
	let GOAL_OPTIONS = $derived([
		{ value: 'weight_loss', label: t('onboarding.goal.weight_loss') },
		{ value: 'easy_digestion', label: t('onboarding.goal.easy_digestion') },
		{ value: 'muscle_gain', label: t('onboarding.goal.muscle_gain') },
		{ value: 'budget', label: t('onboarding.goal.budget') },
		{ value: 'quick_meals', label: t('onboarding.goal.quick_meals') }
	]);
	let HARDWARE_OPTIONS = $derived<{ key: keyof HardwareProfile; label: string }[]>([
		{ key: 'oven', label: t('onboarding.hardware.oven') },
		{ key: 'microwave', label: t('onboarding.hardware.microwave') },
		{ key: 'airfryer', label: t('onboarding.hardware.airfryer') },
		{ key: 'blenderJug', label: t('onboarding.hardware.blenderJug') },
		{ key: 'kitchenScale', label: t('onboarding.hardware.kitchenScale') }
	]);

	let step = $state(1);
	// `existing` is always null at this point (it's only ever populated later, by the $effect
	// above, once hydration completes) — these are the correct neutral P1 defaults, not a
	// pre-fill attempt; referencing `existing` here directly would only capture its initial value
	// and never update, the same state_referenced_locally trap /plan's own budgetInput already
	// documents hitting and fixing this same way.
	let diet = $state('omnivore');
	let allergiesText = $state('');
	let goals = $state<string[]>([]);
	let hardware = $state<HardwareProfile>({
		oven: false,
		microwave: false,
		airfryer: false,
		blenderJug: false,
		kitchenScale: false
	});

	function toggleGoal(value: string) {
		goals = goals.includes(value) ? goals.filter((g) => g !== value) : [...goals, value];
	}

	function next() {
		if (step < 3) step += 1;
	}
	function back() {
		if (step > 1) step -= 1;
	}

	function finish() {
		const dietProfile: DietProfile = {
			diet,
			allergies: allergiesText
				.split(',')
				.map((a) => a.trim())
				.filter(Boolean),
			goals
		};
		const profile: UserProfile = {
			id: existing?.id ?? crypto.randomUUID(),
			displayName: existing?.displayName ?? 'Ty',
			diet: dietProfile,
			hardware
		};
		profileStore.save(profile);
		goto('/');
	}
</script>

<svelte:head>
	<title>{t('onboarding.title')} — Foodia</title>
</svelte:head>

<a href="/" class="skip">{t('onboarding.skip')} &rarr;</a>

<h1>{t('onboarding.title')}</h1>
<p class="lede">{t('onboarding.step', { step })}</p>

{#if step === 1}
	<section>
		<h2>{t('onboarding.dietHeading')}</h2>
		<div class="options">
			{#each DIET_OPTIONS as opt (opt.value)}
				<label class="option">
					<input type="radio" name="diet" value={opt.value} bind:group={diet} />
					{opt.label}
				</label>
			{/each}
		</div>
		<label class="field">
			{t('onboarding.allergiesLabel')}
			<input
				type="text"
				bind:value={allergiesText}
				placeholder={t('onboarding.allergiesPlaceholder')}
			/>
		</label>
	</section>
{:else if step === 2}
	<section>
		<h2>{t('onboarding.goalHeading')}</h2>
		<div class="options">
			{#each GOAL_OPTIONS as opt (opt.value)}
				<label class="option">
					<input
						type="checkbox"
						checked={goals.includes(opt.value)}
						onchange={() => toggleGoal(opt.value)}
					/>
					{opt.label}
				</label>
			{/each}
		</div>
	</section>
{:else}
	<section>
		<h2>{t('onboarding.hardwareHeading')}</h2>
		<div class="options">
			{#each HARDWARE_OPTIONS as opt (opt.key)}
				<label class="option">
					<input type="checkbox" bind:checked={hardware[opt.key]} />
					{opt.label}
				</label>
			{/each}
		</div>
		<p class="hint">{t('onboarding.hardwareHint')}</p>
	</section>
{/if}

<div class="actions">
	{#if step > 1}
		<button class="btn btn--ghost" onclick={back}>&larr; {t('onboarding.back')}</button>
	{/if}
	{#if step < 3}
		<button class="btn btn--primary" onclick={next}>{t('onboarding.next')} &rarr;</button>
	{:else}
		<button class="btn btn--primary" onclick={finish}>{t('onboarding.done')}</button>
	{/if}
</div>

{#if hasData}
	<section class="data-export">
		<h2>{t('dataExport.heading')}</h2>
		<p class="hint">{t('dataExport.lede')}</p>
		<button type="button" class="btn btn--ghost" onclick={handleDownloadData}>
			{t('dataExport.button')}
		</button>
	</section>
{/if}

<p class="activity-link"><a href="/activity">{t('activity.linkFromProfile')}</a></p>

<style lang="scss">
	.skip {
		display: block;
		text-align: right;
		font-size: 13px;
		color: var(--text-secondary);
		text-decoration: none;
		margin-bottom: var(--space-3);
	}
	.lede {
		color: var(--text-secondary);
	}
	section {
		margin: var(--space-4) 0;
	}
	.options {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin-bottom: var(--space-3);
	}
	.option {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		background: var(--bg-surface);
		border-radius: var(--radius-card);
		cursor: pointer;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		font-size: 14px;

		input {
			padding: var(--space-2) var(--space-3);
			border-radius: var(--radius-card);
			border: 1px solid var(--bg-surface-alt);
			font-size: 14px;
			font-family: inherit;
		}
	}
	.hint {
		font-size: 13px;
		color: var(--text-secondary);
	}
	.actions {
		display: flex;
		justify-content: space-between;
		margin-top: var(--space-5);
	}
	.data-export {
		margin-top: var(--space-6);
		padding-top: var(--space-5);
		border-top: 1px solid var(--bg-surface-alt);

		h2 {
			font-size: 16px;
		}
	}
	.activity-link {
		margin-top: var(--space-4);
		font-size: 13px;
	}
</style>
