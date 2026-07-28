<script lang="ts">
	import AuthPageShell from '$lib/components/auth/AuthPageShell.svelte';
	import PasswordResetForm from '$lib/components/auth/PasswordResetForm.svelte';
	import { t } from '$lib/i18n/t';
</script>

<svelte:head>
	<title>{t('auth.passwordReset.title')} — Foodia</title>
</svelte:head>

<AuthPageShell title={t('auth.passwordReset.title')}>
	<PasswordResetForm />
</AuthPageShell>
