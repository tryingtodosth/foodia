<script lang="ts">
	import { goto } from '$app/navigation';
	import { authStore } from '$lib/state/auth.svelte';
	import { t } from '$lib/i18n/t';
	import type { MessageKey } from '$lib/i18n/messages';

	let displayName = $state('');
	let email = $state('');
	let password = $state('');
	let confirmPassword = $state('');
	let errorKey = $state<MessageKey | null>(null);

	// The one thing native HTML5 validation can't express on its own — a real cross-field check,
	// matching 2do's own exact precedent for this same form shape.
	let passwordMismatch = $derived(confirmPassword.length > 0 && password !== confirmPassword);
	let canSubmit = $derived(!passwordMismatch && !authStore.isLoading);

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		errorKey = null;
		if (passwordMismatch) {
			errorKey = 'auth.register.error.passwordMismatch';
			return;
		}
		const result = await authStore.register(email, password, displayName);
		if (result.success) {
			goto('/');
		} else {
			errorKey = 'auth.register.error.emailTaken';
		}
	}
</script>

<form onsubmit={handleSubmit}>
	<label class="field">
		{t('auth.register.displayNameLabel')}
		<input type="text" bind:value={displayName} required autocomplete="name" />
	</label>
	<label class="field">
		{t('auth.emailLabel')}
		<input type="email" bind:value={email} required autocomplete="email" />
	</label>
	<label class="field">
		{t('auth.passwordLabel')}
		<input type="password" bind:value={password} required minlength="6" autocomplete="new-password" />
	</label>
	<label class="field">
		{t('auth.register.confirmPasswordLabel')}
		<input
			type="password"
			bind:value={confirmPassword}
			required
			minlength="6"
			autocomplete="new-password"
		/>
	</label>
	{#if passwordMismatch}
		<p class="error">{t('auth.register.error.passwordMismatch')}</p>
	{:else if errorKey}
		<p class="error" role="alert">{t(errorKey)}</p>
	{/if}
	<button type="submit" class="btn btn--primary" disabled={!canSubmit}>
		{authStore.isLoading ? t('auth.loading') : t('auth.register.submit')}
	</button>
	<p class="links">
		{t('auth.register.haveAccount')} <a href="/login">{t('auth.register.loginLink')}</a>
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
