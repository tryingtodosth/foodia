import type { RecipeCard, RecipeDetail } from '$lib/types/recipe';

// See CLAUDE.md Section 5 — components only ever import this interface, never a concrete
// implementation, so swapping mockApiClient for a real httpApiClient later is a one-line change.
export interface RecipeApiClient {
	list(filters?: Record<string, unknown>): Promise<RecipeCard[]>;
	getCard(id: string): Promise<RecipeCard>;
	getDetail(id: string): Promise<RecipeDetail>;
	/**
	 * Full detail (ingredients included) for a known set of ids — the E-grocery aggregation's own
	 * need: "give me every ingredient for exactly the recipes used in this week's plan," not the
	 * whole corpus. Maps onto a normal real-backend shape too (`GET /recipes?ids=...&detail=full`),
	 * not a mock-only convenience method. Unknown ids are silently dropped, not errored — see
	 * `mockApiClient`'s own implementation.
	 */
	getManyDetails(ids: string[]): Promise<RecipeDetail[]>;
	/**
	 * Session 9's own equipment-filter reconciliation (`lib/utils/cookability.ts`, CLAUDE.md
	 * Section 7 item 26): the home feed and `/plan`'s recipe picker both need `Step.alternatives`
	 * to decide whether a recipe is genuinely cookable, not just the Card's own flat
	 * `requiredEquipment` list — so both now load full `RecipeDetail[]` instead of thin Cards.
	 * `RecipeDetail extends RecipeCard`, so this is a strict superset everywhere a `RecipeCard` is
	 * expected (rendering, `ReactionButtons`, etc.) — no downstream component needed to change.
	 */
	listDetails(): Promise<RecipeDetail[]>;
}
