<script lang="ts">
	import type { ReactionSummary } from '$lib/types/recipe';
	import { applyReactionOverride, type ReactionValue } from '$lib/utils/reaction';

	// Session-only, optimistic — same "component-local override recomputed against the untouched
	// prop" discipline documented in reaction.ts. Doesn't feed back into any list's sort order
	// (see the recipe detail page's own note on why substitution order deliberately freezes at
	// render time rather than jumping under the user's cursor while they vote).
	let { reactions, compact = false }: { reactions: ReactionSummary | undefined; compact?: boolean } =
		$props();

	let override = $state<ReactionValue | null | undefined>(undefined);
	let display = $derived(applyReactionOverride(reactions, override));

	function toggle(value: ReactionValue, event: MouseEvent) {
		event.stopPropagation();
		override = display.currentUserReaction === value ? null : value;
	}
</script>

<span class="reactions" class:compact>
	<button
		type="button"
		class:active={display.currentUserReaction === 'up'}
		onclick={(e) => toggle('up', e)}
	>
		👍 {display.upCount}
	</button>
	<button
		type="button"
		class:active={display.currentUserReaction === 'down'}
		onclick={(e) => toggle('down', e)}
	>
		👎 {display.downCount}
	</button>
</span>

<style lang="scss">
	.reactions {
		display: inline-flex;
		gap: var(--space-1);
	}
	button {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		background: none;
		border: 1px solid var(--bg-surface-alt);
		border-radius: var(--radius-pill);
		padding: 2px 10px;
		font-size: 12px;
		cursor: pointer;
		color: var(--text-secondary);
		font-family: inherit;

		&.active {
			border-color: var(--accent);
			color: var(--accent);
			font-weight: 600;
		}
	}
	.compact button {
		font-size: 11px;
		padding: 1px 8px;
	}
</style>
