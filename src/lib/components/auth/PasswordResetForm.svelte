<script lang="ts">
	import { authStore } from '$lib/state/auth.svelte';
	import { t } from '$lib/i18n/t';

	let email = $state('');
	let submitted = $state(false);

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		await authStore.recoverPassword(email);
		submitted = true;
	}
</script>

{#if submitted}
	<p class="success">{t('auth.passwordReset.success')}</p>
{:else}
	<p class="lede">{t('auth.passwordReset.lede')}</p>
	<form onsubmit={handleSubmit}>
		<label class="field">
			{t('auth.emailLabel')}
			<input type="email" bind:value={email} required autocomplete="email" />
		</label>
		<button type="submit" class="btn btn--primary" disabled={authStore.isLoading}>
			{authStore.isLoading ? t('auth.loading') : t('auth.passwordReset.submit')}
		</button>
	</form>
{/if}
<p class="links"><a href="/login">{t('auth.passwordReset.backToLogin')}</a></p>

<style lang="scss">
	.lede {
		font-size: 13px;
		color: var(--text-secondary);
		margin-top: 0;
	}
	.success {
		font-size: 14px;
		color: var(--status-success);
	}
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
	.links {
		font-size: 13px;
		color: var(--text-secondary);
		margin-top: var(--space-3);

		a {
			color: var(--accent);
		}
	}
	.btn {
		align-self: flex-start;
	}
</style>
