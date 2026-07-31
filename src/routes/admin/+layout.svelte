<script lang="ts">
	// The dashboard shell: a heading, who you're signed in as, and the tab row. Deliberately plain
	// — this is an internal operations tool, the same "dev/operational reference, not customer-
	// facing content" treatment /moderation and /activity already give themselves, right down to
	// the `noindex`.
	import { page } from '$app/state';
	import { t } from '$lib/i18n/t';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	let TABS = $derived([
		{ href: '/admin', label: t('admin.tabOverview') },
		{ href: '/admin/users', label: t('admin.tabUsers') },
		{ href: '/admin/content', label: t('admin.tabContent') },
		{ href: '/admin/moderation', label: t('admin.tabModeration') }
	]);

	// Exact match for the index tab, prefix match for the rest — otherwise /admin would light up
	// on every child route.
	function isActive(href: string): boolean {
		return href === '/admin' ? page.url.pathname === '/admin' : page.url.pathname.startsWith(href);
	}
</script>

<svelte:head>
	<title>{t('admin.pageTitle')} — Foodia</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<header class="admin-head">
	<h1>{t('admin.pageTitle')}</h1>
	<p class="lede">{t('admin.lede')}</p>
	{#if data.adminEmail}
		<p class="who">{t('admin.signedInAs', { email: data.adminEmail })}</p>
	{/if}
</header>

<nav class="tabs">
	{#each TABS as tab (tab.href)}
		<a href={tab.href} class="tab" class:tab--active={isActive(tab.href)}>{tab.label}</a>
	{/each}
</nav>

{@render children()}

<style lang="scss">
	.admin-head {
		margin-bottom: var(--space-3);

		h1 {
			margin-bottom: var(--space-1);
		}
	}
	.lede,
	.who {
		margin: 0;
		font-size: 13px;
		color: var(--text-secondary);
	}
	.tabs {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
		margin-bottom: var(--space-4);
		border-bottom: 1px solid var(--bg-surface-alt);
		padding-bottom: var(--space-2);
	}
	.tab {
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-card);
		text-decoration: none;
		font-size: 14px;
		color: var(--text-secondary);

		&:hover {
			background: var(--bg-surface-alt);
		}
	}
	.tab--active {
		background: var(--bg-surface-alt);
		color: var(--text-primary);
		font-weight: 600;
	}
</style>
