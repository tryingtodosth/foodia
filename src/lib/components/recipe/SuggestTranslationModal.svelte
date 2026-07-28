<script lang="ts">
	// The write-side of content translation: covers BOTH "translate into another language" and
	// "propose a revision of the original text" — deliberately the same form and the same
	// underlying Translation, distinguished only by whether the chosen locale equals the recipe's
	// own sourceLocale. See lib/utils/translations.ts's own header comment for why this reuse is
	// deliberate, not a missing second feature.
	import { untrack } from 'svelte';
	import { t } from '$lib/i18n/t';
	import { COMMON_CONTENT_LOCALES, localeName } from '$lib/i18n/localeNames';
	import { getRecipeVersions } from '$lib/utils/translations';
	import type { RecipeDetail, Translation, TranslatableField, UserRef } from '$lib/types/recipe';

	let {
		recipe,
		translatedBy,
		extraTranslations = [],
		onsubmit,
		onclose
	}: {
		recipe: RecipeDetail;
		translatedBy: UserRef;
		extraTranslations?: Translation[];
		onsubmit: (translation: Translation) => void;
		onclose: () => void;
	} = $props();

	// A deliberate one-time snapshot, untrack'd — this modal is always mounted fresh for whichever
	// recipe is currently open (no code path re-props it onto a different recipe while staying
	// mounted), so there's nothing to stay live-synced with; same "prop seeds initial state"
	// convention used throughout this app.
	const sourceLocale = untrack(() => recipe.sourceLocale ?? 'pl');
	const originalFields: Record<TranslatableField, string> = untrack(() => ({
		name: recipe.name,
		summary: recipe.summary,
		description: recipe.description
	}));
	const OTHER = '__other__';

	// Defaults to a locale that isn't the original when a sensible one exists — most visits here
	// are "translate into a new language," not "improve the original," so that's the better default.
	let localeChoice = $state(sourceLocale === 'en' ? 'pl' : 'en');
	let customLocale = $state('');

	let effectiveLocale = $derived(localeChoice === OTHER ? customLocale.trim() : localeChoice);
	let isOriginalLocale = $derived(effectiveLocale !== '' && effectiveLocale === sourceLocale);

	/** The best already-submitted text for a locale (original merged with the highest-reacted
	 *  Translation, if any) — improving an existing translation should start from what's actually
	 *  there, not from blind original-language text the submitter may not even read. */
	function bestFieldsFor(targetLocale: string): Record<TranslatableField, string> {
		const versions = getRecipeVersions(recipe, extraTranslations);
		const best = versions.find((v) => v.locale === targetLocale && !v.isOriginal)?.translation;
		return best ? { ...originalFields, ...best.fields } : { ...originalFields };
	}

	let name = $state(originalFields.name);
	let summary = $state(originalFields.summary);
	let description = $state(originalFields.description);

	// Re-seed the three fields whenever the selected locale changes.
	$effect(() => {
		const seeded = bestFieldsFor(effectiveLocale || sourceLocale);
		name = seeded.name;
		summary = seeded.summary;
		description = seeded.description;
	});

	// Diffed against the RAW original (never the seeded prefill) — a submitted Translation must
	// carry every field that differs from the original as a complete, independent candidate, not
	// just whatever the submitter personally touched this session. Otherwise a one-field tweak to
	// an already-translated recipe would silently drop the other, previously-translated fields the
	// moment this new submission out-votes the old one (fields not present fall back to original).
	let changedFields = $derived.by(() => {
		const fields: Partial<Record<TranslatableField, string>> = {};
		if (name !== originalFields.name) fields.name = name;
		if (summary !== originalFields.summary) fields.summary = summary;
		if (description !== originalFields.description) fields.description = description;
		return fields;
	});
	let canSubmit = $derived(effectiveLocale.length > 0 && Object.keys(changedFields).length > 0);

	function submit() {
		if (!canSubmit) return;
		const translation: Translation = {
			id: crypto.randomUUID(),
			recipeId: recipe.id,
			locale: effectiveLocale,
			fields: changedFields,
			translatedBy,
			createdAt: new Date().toISOString()
		};
		onsubmit(translation);
	}

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) onclose();
	}
	function handleBackdropKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
	}
</script>

<div
	class="modal-overlay"
	role="button"
	tabindex="0"
	aria-label={t('translation.cancel')}
	onclick={handleBackdropClick}
	onkeydown={handleBackdropKeydown}
>
	<div class="modal">
		<div class="modal__head">
			<h2>
				{isOriginalLocale ? t('translation.modalTitleImproveOriginal') : t('translation.modalTitle')}
			</h2>
			<button type="button" class="modal__close" onclick={onclose} aria-label={t('translation.cancel')}>
				✕
			</button>
		</div>

		<label class="field">
			{t('translation.localeLabel')}
			<select bind:value={localeChoice}>
				{#each COMMON_CONTENT_LOCALES as code (code)}
					<option value={code}>{localeName(code)}</option>
				{/each}
				<option value={OTHER}>{t('translation.otherLocale')}</option>
			</select>
		</label>
		{#if localeChoice === OTHER}
			<label class="field">
				<input type="text" bind:value={customLocale} placeholder={t('translation.otherLocalePlaceholder')} />
			</label>
		{/if}

		{#if isOriginalLocale}
			<p class="hint">{t('translation.localeIsOriginalHint')}</p>
		{/if}

		<label class="field">
			{t('translation.fieldName')}
			<input type="text" bind:value={name} />
		</label>
		<label class="field">
			{t('translation.fieldSummary')}
			<input type="text" bind:value={summary} />
		</label>
		<label class="field">
			{t('translation.fieldDescription')}
			<textarea bind:value={description} rows="4"></textarea>
		</label>

		{#if !canSubmit && effectiveLocale}
			<p class="hint">{t('translation.noChanges')}</p>
		{/if}

		<div class="modal__actions">
			<button type="button" class="btn btn--ghost" onclick={onclose}>{t('translation.cancel')}</button>
			<button type="button" class="btn btn--primary" onclick={submit} disabled={!canSubmit}>
				{t('translation.submit')}
			</button>
		</div>
	</div>
</div>

<style lang="scss">
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.4);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--space-4);
		z-index: 200;
	}
	.modal {
		background: var(--bg-surface);
		border-radius: var(--radius-card);
		padding: var(--space-4);
		max-width: 480px;
		width: 100%;
		max-height: 85vh;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.modal__head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-2);

		h2 {
			font-size: 16px;
			margin: 0;
		}
	}
	.modal__close {
		background: none;
		border: none;
		font-size: 16px;
		cursor: pointer;
		color: var(--text-secondary);
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		font-size: 13px;
		color: var(--text-secondary);

		input,
		select,
		textarea {
			padding: var(--space-2);
			border-radius: var(--radius-card);
			border: 1px solid var(--bg-surface-alt);
			font-size: 14px;
			font-family: inherit;
			color: var(--text-primary);
		}
		textarea {
			resize: vertical;
		}
	}
	.hint {
		font-size: 12px;
		color: var(--text-secondary);
		margin: 0;
	}
	.modal__actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-2);
		margin-top: var(--space-2);
	}
</style>
