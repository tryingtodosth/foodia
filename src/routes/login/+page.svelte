<script lang="ts">
	import AuthPageShell from '$lib/components/auth/AuthPageShell.svelte';
	import LoginForm from '$lib/components/auth/LoginForm.svelte';
	import { t } from '$lib/i18n/t';
</script>

<svelte:head>
	<title>{t('auth.login.title')} — Foodia</title>
</svelte:head>

<AuthPageShell title={t('auth.login.title')}>
	<LoginForm />
</AuthPageShell>
