<script lang="ts">
	import CookingMode from '$lib/components/cooking/CookingMode.svelte';
	import { t } from '$lib/i18n/t';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>{t('cooking.pageTitlePrefix')}: {data.recipe.name} — Foodia</title>
</svelte:head>

<CookingMode recipe={data.recipe} />
