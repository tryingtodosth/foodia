<script lang="ts">
	import AuthPageShell from '$lib/components/auth/AuthPageShell.svelte';
	import RegisterForm from '$lib/components/auth/RegisterForm.svelte';
	import { t } from '$lib/i18n/t';
</script>

<svelte:head>
	<title>{t('auth.register.title')} — Foodia</title>
</svelte:head>

<AuthPageShell title={t('auth.register.title')}>
	<RegisterForm />
</AuthPageShell>
