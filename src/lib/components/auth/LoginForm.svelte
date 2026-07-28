<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { authStore } from '$lib/state/auth.svelte';
	import { t } from '$lib/i18n/t';
	import type { MessageKey } from '$lib/i18n/messages';

	let email = $state('');
	let password = $state('');
	let errorKey = $state<MessageKey | null>(null);

	// Open-redirect safety: only ever accept a relative, in-app path — same restraint 2do's own
	// LoginForm applies for its analogous ?redirectTo= support.
	function resolveRedirectTarget(): string {
		const target = page.url.searchParams.get('redirectTo');
		if (target && target.startsWith('/') && !target.startsWith('//')) return target;
		return '/';
	}

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		errorKey = null;
		const result = await authStore.login(email, password);
		if (result.success) {
			goto(resolveRedirectTarget());
		} else {
			errorKey = 'auth.login.error.invalid';
		}
	}
</script>

<form onsubmit={handleSubmit}>
	<label class="field">
		{t('auth.emailLabel')}
		<input type="email" bind:value={email} required autocomplete="email" />
	</label>
	<label class="field">
		{t('auth.passwordLabel')}
		<input type="password" bind:value={password} required autocomplete="current-password" />
	</label>
	{#if errorKey}
		<p class="error" role="alert">{t(errorKey)}</p>
	{/if}
	<button type="submit" class="btn btn--primary" disabled={authStore.isLoading}>
		{authStore.isLoading ? t('auth.loading') : t('auth.login.submit')}
	</button>
	<p class="links">
		<a href="/password-reset">{t('auth.login.forgotPassword')}</a><br />
		{t('auth.login.noAccount')} <a href="/register">{t('auth.login.registerLink')}</a>
	</p>
</form>

<style lang="scss">
	form {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		font-size: 13px;
		color: var(--text-secondary);

		input {
			padding: var(--space-2) var(--space-3);
			border-radius: var(--radius-card);
			border: 1px solid var(--bg-surface-alt);
			font-size: 14px;
			font-family: inherit;
			color: var(--text-primary);
		}
	}
	.error {
		font-size: 13px;
		color: var(--status-danger);
		margin: 0;
	}
	.links {
		font-size: 13px;
		color: var(--text-secondary);
		margin: 0;

		a {
			color: var(--accent);
		}
	}
	.btn {
		align-self: flex-start;
	}
</style>
