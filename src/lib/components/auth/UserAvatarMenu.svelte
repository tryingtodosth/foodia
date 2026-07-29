<script lang="ts">
	// Purely additive — see auth.svelte.ts's own header comment for why this app deliberately
	// doesn't gate anything behind login. Unauthenticated visitors just see two links; nothing else
	// changes.
	import { authStore } from '$lib/state/auth.svelte';
	import { t } from '$lib/i18n/t';

	function handleLogout() {
		authStore.logout();
	}
</script>

{#if authStore.isAuthenticated && authStore.account}
	<details class="account-menu">
		<summary>{authStore.account.displayName}</summary>
		<div class="account-menu__panel">
			{#if authStore.account.isModerator}
				<a href="/moderation">{t('moderation.pageTitle')}</a>
			{/if}
			<a href="/activity">{t('activity.navLink')}</a>
			<button type="button" onclick={handleLogout}>{t('auth.nav.logout')}</button>
		</div>
	</details>
{:else}
	<div class="account-links">
		<a href="/login">{t('auth.nav.login')}</a>
		<a href="/register">{t('auth.nav.register')}</a>
	</div>
{/if}

<style lang="scss">
	.account-links {
		display: flex;
		gap: var(--space-3);
		font-size: 13px;

		a {
			text-decoration: none;
			color: var(--text-secondary);

			&:hover {
				color: var(--accent);
			}
		}
	}
	.account-menu {
		position: relative;
		font-size: 13px;

		summary {
			cursor: pointer;
			color: var(--text-secondary);
			list-style: none;

			&::-webkit-details-marker {
				display: none;
			}
			&:hover {
				color: var(--accent);
			}
		}
	}
	.account-menu__panel {
		position: absolute;
		right: 0;
		top: calc(100% + var(--space-2));
		background: var(--bg-surface);
		border-radius: var(--radius-card);
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
		padding: var(--space-2);
		z-index: 10;
		min-width: 120px;

		button,
		a {
			display: block;
			width: 100%;
			text-align: left;
			background: none;
			border: none;
			padding: var(--space-2);
			border-radius: var(--radius-card);
			cursor: pointer;
			font-family: inherit;
			font-size: 13px;
			text-decoration: none;
			box-sizing: border-box;

			&:hover {
				background: var(--bg-surface-alt);
			}
		}
		button {
			color: var(--status-danger);
		}
		a {
			color: var(--text-primary);
		}
	}
</style>
