<script lang="ts">
	// The community-translation UI's own disclosure + switcher — same "compact trigger, list every
	// version, pick one" shape 2do's own TranslationBadge documents, adapted to this app's existing
	// `<details>`-based dropdown idiom (already used for the ingredient "Zamień" swap list and the
	// shopping list's "Pokaż jako tekst") rather than introducing a new popover component.
	import { t } from '$lib/i18n/t';
	import { localeName } from '$lib/i18n/localeNames';
	import type { ResolvedRecipeContent, RecipeVersionOption } from '$lib/utils/translations';

	let {
		versions,
		resolved,
		onselect
	}: {
		versions: RecipeVersionOption[];
		resolved: ResolvedRecipeContent;
		onselect: (key: string) => void;
	} = $props();

	let otherVersionsCount = $derived(versions.length - 1);
	let activeKey = $derived(resolved.translation?.id ?? 'original');
</script>

{#if !resolved.isOriginal && resolved.translation}
	<div class="translation-status">
		<span>
			{#if resolved.isSameLocaleSuggestion}
				{t('translation.suggestedRevisionBy', { author: resolved.translation.translatedBy.displayName })}
			{:else}
				{t('translation.shownIn', {
					locale: localeName(resolved.locale),
					author: resolved.translation.translatedBy.displayName
				})}
			{/if}
		</span>
		<button type="button" class="btn btn--ghost btn--small" onclick={() => onselect('original')}>
			{t('translation.viewOriginal')}
		</button>
	</div>
{/if}

{#if otherVersionsCount > 0}
	<details class="version-picker">
		<summary>{t('translation.availableVersions', { n: otherVersionsCount })}</summary>
		<ul>
			{#each versions as version (version.key)}
				<li>
					<button
						type="button"
						class="version-picker__item"
						class:active={version.key === activeKey}
						onclick={() => onselect(version.key)}
					>
						{#if version.isOriginal}
							{t('translation.originalLabel', { locale: localeName(version.locale) })}
						{:else if version.isSameLocaleSuggestion}
							{t('translation.suggestedRevisionBy', {
								author: version.translation?.translatedBy.displayName ?? ''
							})}
						{:else}
							{localeName(version.locale)} ({version.translation?.translatedBy.displayName})
						{/if}
					</button>
				</li>
			{/each}
		</ul>
	</details>
{/if}

<style lang="scss">
	.translation-status {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
		font-size: 13px;
		color: var(--text-secondary);
		background: var(--bg-surface-alt);
		border-radius: var(--radius-card);
		padding: var(--space-2) var(--space-3);
		margin-bottom: var(--space-2);
	}
	.btn--small {
		padding: var(--space-1) var(--space-3);
		font-size: 12px;
	}
	.version-picker {
		margin-bottom: var(--space-2);
		font-size: 13px;

		summary {
			cursor: pointer;
			color: var(--accent);
		}
		ul {
			list-style: none;
			padding: 0;
			margin: var(--space-1) 0 0;
			display: flex;
			flex-direction: column;
			gap: 2px;
		}
	}
	.version-picker__item {
		width: 100%;
		text-align: left;
		background: none;
		border: none;
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius-card);
		cursor: pointer;
		font-family: inherit;
		font-size: 13px;

		&:hover {
			background: var(--bg-surface-alt);
		}
		&.active {
			color: var(--accent);
			font-weight: 600;
		}
	}
</style>
