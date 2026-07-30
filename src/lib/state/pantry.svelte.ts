// Smart Pantry, P1 slice only (CLAUDE.md Section 4.5 / 6.1): a local, client-only checklist —
// no aggregation against a MealPlan and no e-grocery export yet, both are P2. Same lazy-hydrate
// discipline as profile.svelte.ts, and for the same reason (avoid an SSR/client hydration mismatch
// on a returning visitor's already-saved list).
import type { PantryItem } from '$lib/types/pantry';
import { readJSON, writeJSON } from '$lib/utils/storage';

const STORAGE_KEY = 'foodia-pantry';

let items = $state<PantryItem[]>([]);
let hydrated = $state(false);

function persist() {
	writeJSON(STORAGE_KEY, items);
}

export const pantryStore = {
	get items(): PantryItem[] {
		return items;
	},
	get hydrated(): boolean {
		return hydrated;
	},
	hydrate(): void {
		if (hydrated) return;
		items = readJSON<PantryItem[]>(STORAGE_KEY) ?? [];
		hydrated = true;
	},
	/**
	 * Merges into an existing item on a match, rather than always appending — same `(name, unit)`
	 * compound-key convention `shoppingList.ts`'s `aggregateIngredients` already establishes
	 * (case-insensitive, trimmed), so "Sól" logged twice in the same unit becomes one row with the
	 * summed quantity instead of two phantom-duplicate rows (CLAUDE.md Section 7 item 12/
	 * `FUTURES.md` Section 1 — a real, previously-flagged bug, not a new behavior). A different
	 * unit for the same ingredient name is deliberately still a separate row, for the identical
	 * "can't safely convert units" reason `crossReferencePantry` already states.
	 */
	add(input: { ingredientName: string; quantity: number; unit: string }): void {
		const trimmed = input.ingredientName.trim();
		if (!trimmed) return;
		// A plain state module has no UI locale to read (that's `pantry.unitDefault`, resolved by
		// the page before this is ever called) — 'pc' is a neutral fallback for the rare direct
		// caller that somehow supplies an empty unit, not a second, competing default to keep in sync.
		const unit = input.unit || 'pc';
		const key = (name: string, u: string) => `${name.trim().toLowerCase()}::${u.trim().toLowerCase()}`;
		const targetKey = key(trimmed, unit);
		const existing = items.find((item) => key(item.ingredientName, item.unit) === targetKey);
		if (existing) {
			items = items.map((item) =>
				item.id === existing.id
					? {
							...item,
							quantity: item.quantity + input.quantity,
							updatedAt: new Date().toISOString()
						}
					: item
			);
		} else {
			items = [
				...items,
				{
					id: crypto.randomUUID(),
					ingredientName: trimmed,
					quantity: input.quantity,
					unit,
					updatedAt: new Date().toISOString()
				}
			];
		}
		persist();
	},
	/** "Odklikuje to, co zużyła" (CLAUDE.md 4.5) — P1 has no MealPlan to reconcile against, so
	 *  using an item up just removes it from the checklist rather than decrementing a quantity.
	 *  Returns the removed row (or `null` if the id was already gone) so the caller can offer a
	 *  real undo — Session 24's own "easy to remove, impossible to add back" gap, closed by giving
	 *  the page something real to restore rather than just a bare id. */
	markUsed(id: string): PantryItem | null {
		const removed = items.find((item) => item.id === id) ?? null;
		if (!removed) return null;
		items = items.filter((item) => item.id !== id);
		persist();
		return removed;
	},
	/** Puts a just-removed row back exactly as it was — not routed through `add()`'s own
	 *  merge-by-(name, unit) logic, which is for genuinely NEW quantities being logged, not for
	 *  restoring a specific row a cook only just clicked away by mistake. Idempotent: a no-op if
	 *  that id is already present (guards against an undo firing twice, e.g. a stray double-click). */
	restore(item: PantryItem): void {
		if (items.some((i) => i.id === item.id)) return;
		items = [...items, item];
		persist();
	}
};
