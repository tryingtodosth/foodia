<script lang="ts">
	import type { Snippet } from 'svelte';

	let { title, children }: { title: string; children: Snippet } = $props();
</script>

<div class="auth-shell">
	<div class="auth-card">
		<h1>{title}</h1>
		{@render children()}
	</div>
</div>

<style lang="scss">
	.auth-shell {
		display: flex;
		justify-content: center;
		padding: var(--space-6) var(--space-4);
	}
	.auth-card {
		background: var(--bg-surface);
		border-radius: var(--radius-card);
		padding: var(--space-5);
		max-width: 380px;
		width: 100%;

		h1 {
			font-size: 20px;
			margin: 0 0 var(--space-4);
		}
	}
</style>
