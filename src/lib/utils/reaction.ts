// Upvote/downvote for Module 4's node-based comments and community substitutions
// (CLAUDE.md 4.4/6.4/7 item 9's own D3-brainstorm precedent for sorting by reaction).
// Same optimistic-override discipline 2do's own ReactionModule documents: always recompute
// from the untouched base `ReactionSummary` plus a local override, never mutate the base or
// chain overrides on top of a previously-computed display — that's what avoids drift/double
// counting across repeated clicks.
import type { ReactionSummary } from '$lib/types/recipe';

export type ReactionValue = 'up' | 'down';

const EMPTY: ReactionSummary = { upCount: 0, downCount: 0, currentUserReaction: null };

export function applyReactionOverride(
	base: ReactionSummary | undefined,
	override: ReactionValue | null | undefined
): ReactionSummary {
	const start = base ?? EMPTY;
	if (override === undefined) return start;

	let { upCount, downCount } = start;
	if (start.currentUserReaction === 'up') upCount -= 1;
	if (start.currentUserReaction === 'down') downCount -= 1;
	if (override === 'up') upCount += 1;
	if (override === 'down') downCount += 1;

	return { upCount, downCount, currentUserReaction: override };
}
