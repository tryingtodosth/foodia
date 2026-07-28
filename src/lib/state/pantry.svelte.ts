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
	add(input: { ingredientName: string; quantity: number; unit: string }): void {
		const trimmed = input.ingredientName.trim();
		if (!trimmed) return;
		items = [
			...items,
			{
				id: crypto.randomUUID(),
				ingredientName: trimmed,
				quantity: input.quantity,
				unit: input.unit || 'szt',
				updatedAt: new Date().toISOString()
			}
		];
		persist();
	},
	/** "Odklikuje to, co zużyła" (CLAUDE.md 4.5) — P1 has no MealPlan to reconcile against, so
	 *  using an item up just removes it from the checklist rather than decrementing a quantity. */
	markUsed(id: string): void {
		items = items.filter((item) => item.id !== id);
		persist();
	}
};
