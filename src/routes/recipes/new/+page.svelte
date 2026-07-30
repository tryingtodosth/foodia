<script lang="ts">
	// The Recipe-First Composer (CLAUDE.md 4.2 / FUTURES.md 9.4's own picked-first option) —
	// closes the single largest, most-repeatedly-flagged gap in this whole app: "there is currently
	// no way for a user to create or import a recipe at all." A single-page editor, not a step-gated
	// wizard like /onboarding — recipe authoring benefits from seeing ingredients and steps
	// together (a step usually names an ingredient it needs), a deliberate difference from
	// onboarding's own linear flow, not an inconsistency.
	//
	// Ingredients/steps are tracked with a stable client-only `localId`, NOT array index — dragging
	// to reorder ingredients must never silently change which ingredient a step refers to. Only at
	// submit time do a step's `ingredientLocalIds` get resolved to real array positions
	// (`CreateRecipeInput.ingredientIndexes`), by which point the ingredient order is final.
	import { goto } from '$app/navigation';
	import { authStore } from '$lib/state/auth.svelte';
	import { t } from '$lib/i18n/t';
	import type { HardwareProfile } from '$lib/types/user';
	import type { CreateRecipeInput } from '$lib/types/recipeInput';

	let EQUIPMENT_OPTIONS = $derived<{ key: keyof HardwareProfile; label: string }[]>([
		{ key: 'oven', label: t('onboarding.hardware.oven') },
		{ key: 'microwave', label: t('onboarding.hardware.microwave') },
		{ key: 'airfryer', label: t('onboarding.hardware.airfryer') },
		{ key: 'blenderJug', label: t('onboarding.hardware.blenderJug') },
		{ key: 'kitchenScale', label: t('onboarding.hardware.kitchenScale') }
	]);

	interface DraftIngredient {
		localId: string;
		name: string;
		quantity: string;
		unit: string;
	}
	interface DraftStep {
		localId: string;
		text: string;
		durationMinutes: string;
		ingredientLocalIds: string[];
	}

	let name = $state('');
	let summary = $state('');
	let description = $state('');
	let heroImage = $state('');
	let tagsText = $state('');
	let dietFlagsText = $state('');
	let equipment = $state<Record<string, boolean>>({});
	let timeMinutes = $state('');
	let costAmount = $state('');
	let kcal = $state('');
	let proteinG = $state('');
	let fatG = $state('');
	let carbsG = $state('');

	let ingredients = $state<DraftIngredient[]>([
		{ localId: crypto.randomUUID(), name: '', quantity: '', unit: '' }
	]);
	let steps = $state<DraftStep[]>([
		{ localId: crypto.randomUUID(), text: '', durationMinutes: '', ingredientLocalIds: [] }
	]);

	let submitting = $state(false);
	let errorMessage = $state('');

	function addIngredient() {
		ingredients = [...ingredients, { localId: crypto.randomUUID(), name: '', quantity: '', unit: '' }];
	}
	function removeIngredient(localId: string) {
		ingredients = ingredients.filter((i) => i.localId !== localId);
		steps = steps.map((s) => ({
			...s,
			ingredientLocalIds: s.ingredientLocalIds.filter((id) => id !== localId)
		}));
	}
	function addStep() {
		steps = [...steps, { localId: crypto.randomUUID(), text: '', durationMinutes: '', ingredientLocalIds: [] }];
	}
	function removeStep(localId: string) {
		steps = steps.filter((s) => s.localId !== localId);
	}
	function toggleStepIngredient(stepLocalId: string, ingredientLocalId: string) {
		steps = steps.map((s) => {
			if (s.localId !== stepLocalId) return s;
			const has = s.ingredientLocalIds.includes(ingredientLocalId);
			return {
				...s,
				ingredientLocalIds: has
					? s.ingredientLocalIds.filter((id) => id !== ingredientLocalId)
					: [...s.ingredientLocalIds, ingredientLocalId]
			};
		});
	}

	// One small, reusable drag-reorder helper for both lists — native HTML5 DnD, no new dependency.
	function reorder<T>(list: T[], fromIndex: number, toIndex: number): T[] {
		const copy = [...list];
		const [moved] = copy.splice(fromIndex, 1);
		copy.splice(toIndex, 0, moved);
		return copy;
	}
	let draggedIngredientIndex = $state<number | null>(null);
	let draggedStepIndex = $state<number | null>(null);

	function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		errorMessage = '';

		const cleanIngredients = ingredients.filter((i) => i.name.trim());
		if (cleanIngredients.length === 0 || steps.every((s) => !s.text.trim())) {
			errorMessage = t('recipeComposer.minimumNote');
			return;
		}

		const input: CreateRecipeInput = {
			name: name.trim(),
			summary: summary.trim(),
			description: description.trim(),
			heroImage: heroImage.trim(),
			tags: tagsText.split(',').map((s) => s.trim()).filter(Boolean),
			dietFlags: dietFlagsText.split(',').map((s) => s.trim()).filter(Boolean),
			requiredEquipment: Object.entries(equipment)
				.filter(([, v]) => v)
				.map(([k]) => k),
			timeMinutes: Number(timeMinutes) || 0,
			costEstimate: costAmount ? { amount: Number(costAmount), currency: 'PLN' } : undefined,
			macros: {
				kcal: Number(kcal) || 0,
				proteinG: Number(proteinG) || 0,
				fatG: Number(fatG) || 0,
				carbsG: Number(carbsG) || 0
			},
			ingredients: cleanIngredients.map((i) => ({
				name: i.name.trim(),
				quantity: Number(i.quantity) || 0,
				unit: i.unit.trim() || t('pantry.unitDefault')
			})),
			steps: steps
				.filter((s) => s.text.trim())
				.map((s) => ({
					text: s.text.trim(),
					durationMinutes: s.durationMinutes ? Number(s.durationMinutes) : undefined,
					ingredientIndexes: s.ingredientLocalIds
						.map((id) => cleanIngredients.findIndex((i) => i.localId === id))
						.filter((idx) => idx >= 0)
				}))
		};

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
	<form onsubmit={handleSubmit}>
		<section>
			<h2>{t('recipeComposer.basicsHeading')}</h2>
			<label class="field">
				{t('recipeComposer.nameLabel')}
				<input type="text" bind:value={name} required />
			</label>
			<label class="field">
				{t('recipeComposer.summaryLabel')}
				<input type="text" bind:value={summary} required />
			</label>
			<label class="field">
				{t('recipeComposer.descriptionLabel')}
				<textarea bind:value={description} rows="3" required></textarea>
			</label>
			<label class="field">
				{t('recipeComposer.heroImageLabel')}
				<input type="url" bind:value={heroImage} placeholder="https://..." />
			</label>
			<label class="field">
				{t('recipeComposer.tagsLabel')}
				<input type="text" bind:value={tagsText} placeholder="obiad, szybkie" />
			</label>
			<label class="field">
				{t('recipeComposer.dietFlagsLabel')}
				<input type="text" bind:value={dietFlagsText} placeholder="wegetariańskie" />
			</label>
			<div class="field">
				{t('recipeComposer.equipmentLabel')}
				<div class="options">
					{#each EQUIPMENT_OPTIONS as opt (opt.key)}
						<label class="option">
							<input type="checkbox" bind:checked={equipment[opt.key]} />
							{opt.label}
						</label>
					{/each}
				</div>
			</div>
			<div class="row">
				<label class="field">
					{t('recipeComposer.timeLabel')}
					<input type="number" min="0" bind:value={timeMinutes} required />
				</label>
				<label class="field">
					{t('recipeComposer.costLabel')}
					<input type="number" min="0" step="0.01" bind:value={costAmount} />
				</label>
			</div>
			<h3>{t('recipeComposer.macrosHeading')}</h3>
			<div class="row">
				<label class="field">{t('recipeComposer.kcalLabel')}<input type="number" min="0" bind:value={kcal} /></label>
				<label class="field">{t('recipeComposer.proteinLabel')}<input type="number" min="0" bind:value={proteinG} /></label>
				<label class="field">{t('recipeComposer.fatLabel')}<input type="number" min="0" bind:value={fatG} /></label>
				<label class="field">{t('recipeComposer.carbsLabel')}<input type="number" min="0" bind:value={carbsG} /></label>
			</div>
		</section>

		<section>
			<h2>{t('recipeComposer.ingredientsHeading')}</h2>
			<p class="hint">{t('recipeComposer.ingredientsHint')}</p>
			<ul class="draglist">
				{#each ingredients as ing, index (ing.localId)}
					<li
						class="draglist__row"
						class:dragging={draggedIngredientIndex === index}
						draggable="true"
						ondragstart={() => (draggedIngredientIndex = index)}
						ondragover={(e) => e.preventDefault()}
						ondrop={() => {
							if (draggedIngredientIndex !== null) {
								ingredients = reorder(ingredients, draggedIngredientIndex, index);
							}
							draggedIngredientIndex = null;
						}}
					>
						<span class="handle" aria-hidden="true">⠿</span>
						<input
							type="text"
							bind:value={ing.name}
							placeholder={t('recipeComposer.ingredientNamePlaceholder')}
							class="ing-name"
						/>
						<input type="number" min="0" step="any" bind:value={ing.quantity} placeholder={t('recipeComposer.quantityPlaceholder')} class="ing-qty" />
						<input type="text" bind:value={ing.unit} placeholder={t('recipeComposer.unitPlaceholder')} class="ing-unit" />
						<button type="button" class="btn btn--ghost" onclick={() => removeIngredient(ing.localId)}>
							{t('recipeComposer.removeIngredient')}
						</button>
					</li>
				{/each}
			</ul>
			<button type="button" class="btn btn--ghost" onclick={addIngredient}>{t('recipeComposer.addIngredient')}</button>
		</section>

		<section>
			<h2>{t('recipeComposer.stepsHeading')}</h2>
			<p class="hint">{t('recipeComposer.stepsHint')}</p>
			<ul class="draglist">
				{#each steps as step, index (step.localId)}
					<li
						class="draglist__row draglist__row--step"
						class:dragging={draggedStepIndex === index}
						draggable="true"
						ondragstart={() => (draggedStepIndex = index)}
						ondragover={(e) => e.preventDefault()}
						ondrop={() => {
							if (draggedStepIndex !== null) {
								steps = reorder(steps, draggedStepIndex, index);
							}
							draggedStepIndex = null;
						}}
					>
						<div class="step-main">
							<span class="handle" aria-hidden="true">⠿</span>
							<span class="step-number">{index + 1}.</span>
							<textarea bind:value={step.text} placeholder={t('recipeComposer.stepTextPlaceholder')} rows="2"></textarea>
							<button type="button" class="btn btn--ghost" onclick={() => removeStep(step.localId)}>
								{t('recipeComposer.removeStep')}
							</button>
						</div>
						<label class="field field--inline">
							{t('recipeComposer.stepDurationLabel')}
							<input type="number" min="0" bind:value={step.durationMinutes} />
						</label>
						{#if ingredients.some((i) => i.name.trim())}
							<div class="step-uses">
								<span class="step-uses__label">{t('recipeComposer.stepUsesLabel')}</span>
								{#each ingredients.filter((i) => i.name.trim()) as ing (ing.localId)}
									<label class="option option--compact">
										<input
											type="checkbox"
											checked={step.ingredientLocalIds.includes(ing.localId)}
											onchange={() => toggleStepIngredient(step.localId, ing.localId)}
										/>
										{ing.name}
									</label>
								{/each}
							</div>
						{/if}
					</li>
				{/each}
			</ul>
			<button type="button" class="btn btn--ghost" onclick={addStep}>{t('recipeComposer.addStep')}</button>
		</section>

		{#if errorMessage}
			<p class="error" role="alert">{errorMessage}</p>
		{/if}

		<button type="submit" class="btn btn--primary" disabled={submitting}>
			{submitting ? t('recipeComposer.publishing') : t('recipeComposer.publish')}
		</button>
	</form>
{/if}

<style lang="scss">
	h1 {
		margin-bottom: var(--space-4);
	}
	section {
		margin-bottom: var(--space-6);
		padding-bottom: var(--space-5);
		border-bottom: 1px solid var(--bg-surface-alt);
	}
	.notice {
		color: var(--text-secondary);
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		font-size: 13px;
		color: var(--text-secondary);
		margin-bottom: var(--space-3);
		flex: 1;

		input,
		textarea {
			padding: var(--space-2) var(--space-3);
			border-radius: var(--radius-card);
			border: 1px solid var(--bg-surface-alt);
			font-size: 14px;
			font-family: inherit;
			color: var(--text-primary);
		}
	}
	.field--inline {
		max-width: 320px;
	}
	.row {
		display: flex;
		gap: var(--space-3);
		flex-wrap: wrap;
	}
	.options {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-top: var(--space-1);
	}
	.option {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--bg-surface-alt);
		border-radius: var(--radius-pill);
		font-size: 13px;
		cursor: pointer;
	}
	.option--compact {
		font-size: 12px;
		padding: 2px var(--space-2);
	}
	.hint {
		font-size: 12px;
		color: var(--text-secondary);
		margin-top: -6px;
	}
	.draglist {
		list-style: none;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.draglist__row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2);
		border: 1px solid var(--bg-surface-alt);
		border-radius: var(--radius-card);
		background: var(--bg-surface);
		cursor: grab;

		&.dragging {
			opacity: 0.4;
		}
	}
	.draglist__row--step {
		flex-direction: column;
		align-items: stretch;
		cursor: default;
	}
	.step-main {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);

		textarea {
			flex: 1;
			padding: var(--space-2) var(--space-3);
			border-radius: var(--radius-card);
			border: 1px solid var(--bg-surface-alt);
			font-family: inherit;
			font-size: 14px;
		}
	}
	.step-number {
		font-weight: 600;
		padding-top: var(--space-2);
	}
	.step-uses {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1);
		margin-top: var(--space-2);
		padding-left: calc(var(--space-2) * 2 + 1.5em);
	}
	.step-uses__label {
		font-size: 12px;
		color: var(--text-secondary);
		margin-right: var(--space-1);
	}
	.handle {
		cursor: grab;
		color: var(--text-secondary);
		font-size: 16px;
		flex: none;
	}
	.ing-name {
		flex: 2;
	}
	.ing-qty {
		flex: 0 0 90px;
	}
	.ing-unit {
		flex: 0 0 90px;
	}
	.error {
		color: var(--status-warning);
		font-size: 13px;
	}
</style>
