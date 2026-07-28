<script lang="ts">
	import type { NodeComment } from '$lib/types/recipe';
	import ReactionButtons from './ReactionButtons.svelte';

	let { comment }: { comment: NodeComment } = $props();
</script>

<p class="node-comment" class:private={comment.visibility === 'private'}>
	<span class="node-comment__head">
		{comment.visibility === 'private' ? '🔒' : '💬'}
		<strong>{comment.author.displayName}:</strong>
	</span>
	{comment.content}
	{#if comment.visibility === 'public'}
		<!-- Voting on your own private note would be meaningless — only public, community-facing
		     suggestions get upvote/downvote (CLAUDE.md 4.4/6.4). -->
		<ReactionButtons reactions={comment.reactions} compact />
	{/if}
</p>

<style lang="scss">
	.node-comment {
		font-size: 13px;
		margin: var(--space-1) 0 0;
		padding-left: var(--space-3);
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);

		&.private {
			color: var(--text-secondary);
			font-style: italic;
		}
	}
	.node-comment__head {
		display: contents;
	}
</style>
