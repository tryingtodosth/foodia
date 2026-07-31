// Smart Pantry, P1 slice only (CLAUDE.md Section 4.5 / 6.1): a local, client-only checklist —
// no aggregation against a MealPlan and no e-grocery export yet, both are P2. Same lazy-hydrate
// discipline as profile.svelte.ts, and for the same reason (avoid an SSR/client hydration mismatch
// on a returning visitor's already-saved list).
import type { PantryItem } from '$lib/types/pantry';
import { readJSON, writeJSON } from '$lib/utils/storage';
import { convertQuantity, normalizeUnit } from '$lib/utils/units';
import { DENSITY_CLASS_G_PER_ML } from '$lib/types/units';
import { ingredientDensityStore } from './ingredientDensity.svelte';

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
	 * (case-insensitive, trimmed, and now unit-alias-normalized too — "Tbsp" and "tablespoons" are
	 * the same unit, CLAUDE.md 4.5/4.7 Session 25). A different unit for the same ingredient name
	 * now also merges for real, wherever real conversion math allows it (`lib/utils/units.ts`):
	 * same-family (g<->oz) always; cross-family (cup<->g) only when a `DensityClass` is already
	 * cached for that ingredient. No density prompt fires from here — that UI belongs on the
	 * shopping list, where an unresolved mismatch actually blocks a real decision; a still-different
	 * unit with no resolvable conversion just becomes its own separate row, same honest fallback
	 * this function always had.
	 */
	add(input: { ingredientName: string; quantity: number; unit: string }): void {
		const trimmed = input.ingredientName.trim();
		if (!trimmed) return;
		// A plain state module has no UI locale to read (that's `pantry.unitDefault`, resolved by
		// the page before this is ever called) — 'pc' is a neutral fallback for the rare direct
		// caller that somehow supplies an empty unit, not a second, competing default to keep in sync.
		const unit = input.unit || 'pc';
		const nameKey = trimmed.toLowerCase();

		const exactMatch = items.find(
			(item) =>
				item.ingredientName.trim().toLowerCase() === nameKey &&
				normalizeUnit(item.unit) === normalizeUnit(unit)
		);
		if (exactMatch) {
			items = items.map((item) =>
				item.id === exactMatch.id
					? { ...item, quantity: item.quantity + input.quantity, updatedAt: new Date().toISOString() }
					: item
			);
			persist();
			return;
		}

		const sameNameOtherUnit = items.find((item) => item.ingredientName.trim().toLowerCase() === nameKey);
		if (sameNameOtherUnit) {
			const densityClass = ingredientDensityStore.classFor(trimmed);
			const densityGPerMl = densityClass ? DENSITY_CLASS_G_PER_ML[densityClass] : undefined;
			const converted = convertQuantity(input.quantity, unit, sameNameOtherUnit.unit, densityGPerMl);
			if (converted !== null) {
				items = items.map((item) =>
					item.id === sameNameOtherUnit.id
						? { ...item, quantity: item.quantity + converted, updatedAt: new Date().toISOString() }
						: item
				);
				persist();
				return;
			}
		}

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
