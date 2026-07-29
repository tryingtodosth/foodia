<script lang="ts">
	import { untrack } from 'svelte';
	import '$lib/styles/global.scss';
	import { profileStore } from '$lib/state/profile.svelte';
	import { pantryStore } from '$lib/state/pantry.svelte';
	import { mealPlanStore } from '$lib/state/mealPlan.svelte';
	import { uiLocaleStore } from '$lib/state/uiLocale.svelte';
	import { authStore } from '$lib/state/auth.svelte';
	import { getCookie } from '$lib/utils/cookies';
	import { isUiLocale } from '$lib/i18n/locales';
	import LanguageSwitcher from '$lib/components/shared/LanguageSwitcher.svelte';
	import UserAvatarMenu from '$lib/components/auth/UserAvatarMenu.svelte';
	import AppFooter from '$lib/components/shared/AppFooter.svelte';
	import { t } from '$lib/i18n/t';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	// A plain top-level (not $effect-gated) write — runs identically during SSR and the client's
	// very first render, so both agree on the locale from the first paint. hooks.server.ts already
	// resolved the correct value per request (cookie, then Accept-Language, then the app default);
	// this just threads it into the reactive store every `t()` call reads. LanguageSwitcher owns
	// all further changes for the rest of the session — deliberately a one-time seed, `untrack`'d
	// per the same "explicit one-time read" convention used everywhere else in this app (2do's own
	// documented pattern for a prop that seeds initial state without staying live-synced after).
	uiLocaleStore.set(untrack(() => data.locale));

	// Corrects the seed above for the Capacitor static build specifically (harmless, and a genuine
	// safety net, for the regular SSR build too): a prerendered page's `data.locale` was baked in
	// at BUILD time against a synthetic request with no real cookie, so it's always the app's bare
	// default — this reads the actual `foodia-locale` cookie once the app is truly running in the
	// browser/WebView and corrects the store if it disagrees. A one-tick flash at worst, same class
	// of acceptable tradeoff already documented for profile/pantry's own lazy hydration.
	$effect(() => {
		const cookieLocale = getCookie('foodia-locale');
		if (isUiLocale(cookieLocale) && cookieLocale !== uiLocaleStore.locale) {
			uiLocaleStore.set(cookieLocale);
		}
	});

	// document.documentElement.lang is DOM chrome Svelte doesn't otherwise template — a direct,
	// deliberate write for an accessibility/SEO attribute, same category of exception 2do's own
	// doc allows for genuinely global, non-component DOM state.
	$effect(() => {
		document.documentElement.lang = uiLocaleStore.locale;
	});

	// Client-only hydration for every local-only store — $effect never runs during SSR, so this
	// deliberately can't run until the browser has mounted. See profile.svelte.ts's own header
	// comment for why that's what keeps the very first render from mismatching the server's.
	$effect(() => {
		profileStore.hydrate();
		pantryStore.hydrate();
		mealPlanStore.hydrate();
		authStore.hydrate();
	});
</script>

<div class="shell">
	<header class="shell__nav">
		<a href="/" class="shell__brand">🍲 Foodia</a>
		<nav class="shell__links">
			<a href="/plan">{t('nav.plan')}</a>
			<a href="/shopping-list">{t('nav.shoppingList')}</a>
			<a href="/pantry">{t('nav.pantry')}</a>
			<a href="/onboarding">{t('nav.profile')}</a>
			<a href="/recipes/new">{t('nav.newRecipe')}</a>
		</nav>
		<div class="shell__account">
			<UserAvatarMenu />
			<LanguageSwitcher />
		</div>
	</header>
	<main class="shell__main">
		{@render children()}
	</main>
	<AppFooter />
</div>

<style lang="scss">
	.shell {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
	}
	.shell__nav {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		border-bottom: 1px solid var(--bg-surface-alt);
		background: var(--bg-surface);
		flex-wrap: wrap;
	}
	.shell__brand {
		font-size: 20px;
		font-weight: 600;
		text-decoration: none;
		color: var(--accent);
	}
	.shell__links {
		display: flex;
		gap: var(--space-4);
		font-size: 14px;
		flex-wrap: wrap;

		a {
			text-decoration: none;
			color: var(--text-secondary);

			&:hover {
				color: var(--accent);
			}
		}
	}
	.shell__account {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}
	.shell__main {
		flex: 1;
		padding: var(--space-4);
		max-width: 960px;
		width: 100%;
		margin: 0 auto;
	}
</style>
