<script lang="ts">
	import LanguageSwitcher from './LanguageSwitcher.svelte';
	import { t } from '$lib/i18n/t';

	const year = new Date().getFullYear();
</script>

<footer class="app-footer">
	<div class="app-footer__brand">
		<span class="app-footer__logo">🍲 Foodia</span>
		<span class="app-footer__tagline">{t('footer.tagline')}</span>
	</div>
	<div class="app-footer__lang">
		<LanguageSwitcher />
	</div>
	<div class="app-footer__copy">{t('footer.copyright', { year })}</div>
</footer>

<style lang="scss">
	.app-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: var(--space-3);
		padding: var(--space-4);
		border-top: 1px solid var(--bg-surface-alt);
		background: var(--bg-surface);
		font-size: 12px;
		color: var(--text-secondary);
	}
	.app-footer__brand {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
	}
	.app-footer__logo {
		font-weight: 600;
		color: var(--accent);
	}
	.app-footer__copy {
		white-space: nowrap;
	}

	@media (max-width: 480px) {
		.app-footer {
			flex-direction: column;
			align-items: flex-start;
		}
	}
</style>
