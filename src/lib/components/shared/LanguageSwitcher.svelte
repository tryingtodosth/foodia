<script lang="ts">
	// Instant, no-reload language switching: writes the store directly (every `t()` call site
	// re-renders reactively) and persists the choice as a cookie so the NEXT fresh page load
	// starts server-rendered in the right language too — see uiLocale.svelte.ts's own header
	// comment for why a cookie, not localStorage, is the correct persistence mechanism here.
	import { uiLocaleStore } from '$lib/state/uiLocale.svelte';
	import { UI_LOCALES, UI_LOCALE_LABEL } from '$lib/i18n/locales';
	import { setCookie } from '$lib/utils/cookies';
	import { t } from '$lib/i18n/t';

	const LOCALE_COOKIE = 'foodia-locale';

	function selectLocale(locale: (typeof UI_LOCALES)[number]) {
		uiLocaleStore.set(locale);
		setCookie(LOCALE_COOKIE, locale, 365);
	}
</script>

<div class="lang-switcher" role="group" aria-label={t('footer.language')}>
	{#each UI_LOCALES as locale (locale)}
		<button
			type="button"
			class:active={uiLocaleStore.locale === locale}
			aria-pressed={uiLocaleStore.locale === locale}
			onclick={() => selectLocale(locale)}
		>
			{UI_LOCALE_LABEL[locale]}
		</button>
	{/each}
</div>

<style lang="scss">
	.lang-switcher {
		display: inline-flex;
		gap: 2px;
		background: var(--bg-surface-alt);
		border-radius: var(--radius-pill);
		padding: 2px;
	}
	button {
		border: none;
		background: none;
		font-family: inherit;
		font-size: 12px;
		padding: 4px 10px;
		border-radius: var(--radius-pill);
		cursor: pointer;
		color: var(--text-secondary);

		&.active {
			background: var(--bg-surface);
			color: var(--accent);
			font-weight: 600;
		}
	}
</style>
