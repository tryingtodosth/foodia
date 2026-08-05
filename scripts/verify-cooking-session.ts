// Standalone verification for the cooking session's own pure half — the pantry deduction that
// closes the plan -> shopping-list -> pantry loop (CLAUDE.md 4.3/4.5, FUTURES.md Section 1 item 4).
//
// Imports the REAL modules rather than mirroring them, the same standard `verify-units.ts` set:
// `cookingDeduction.ts`'s only non-relative value import is `units.ts`, which resolves through the
// `paths` entry in `.svelte-kit/tsconfig.json` that tsx reads — so these assertions run against
// exactly the code the app ships. Only `pantryStore.consume`/`restoreConsumed` are mirrored (a rune
// store can't be evaluated under plain tsx), and they're labelled as mirrors at the call site
// rather than left to look like the real thing.
//
// Run with `npx tsx scripts/verify-cooking-session.ts`.
import { effectiveIngredient, planPantryDeduction } from '../src/lib/utils/cookingDeduction';
import type { CookingSubstitutionChoice, PantryDeduction } from '../src/lib/types/cooking';
import type { PantryItem } from '../src/lib/types/pantry';
import type { DensityClass } from '../src/lib/types/units';

let passed = 0;
let failed = 0;

function check(label: string, actual: unknown, expected: unknown): void {
	const ok = JSON.stringify(actual) === JSON.stringify(expected);
	if (ok) {
		passed++;
		console.log(`  ✓ ${label}`);
	} else {
		failed++;
		console.log(
			`  ✗ ${label}\n      expected: ${JSON.stringify(expected)}\n      actual:   ${JSON.stringify(actual)}`
		);
	}
}

/** Conversion math produces long decimals by nature — compare at the precision the UI renders. */
function checkClose(label: string, actual: number | undefined, expected: number): void {
	const ok = actual !== undefined && Math.abs(actual - expected) < 0.05;
	if (ok) {
		passed++;
		console.log(`  ✓ ${label}`);
	} else {
		failed++;
		console.log(`  ✗ ${label}\n      expected: ~${expected}\n      actual:   ${actual}`);
	}
}

let rowSeq = 0;
function pantryRow(name: string, unit: string, quantity: number, updatedAt = ''): PantryItem {
	rowSeq += 1;
	return {
		id: `p${rowSeq}`,
		ingredientName: name,
		quantity,
		unit,
		// Deterministic and ascending unless overridden — the deduction spends oldest rows first, so
		// these timestamps are load-bearing for the FIFO assertions below, not decoration.
		updatedAt: updatedAt || `2026-01-${String(rowSeq).padStart(2, '0')}T10:00:00.000Z`
	};
}

function ing(id: string, name: string, quantity: number, unit: string) {
	return { id, name, quantity, unit };
}

const noDensity = () => undefined;
const asFlour = (): DensityClass => 'powdery';

console.log('\neffectiveIngredient — what was really used, once a swap is recorded');
const swap: Record<string, CookingSubstitutionChoice> = {
	i1: { ingredientId: 'i1', substitutionId: 's1', name: 'Mleko owsiane', ratio: 1 }
};
check(
	'no swap recorded: the recipe\'s own ingredient, untouched',
	effectiveIngredient(ing('i1', 'Mleko', 200, 'ml'), {}),
	{ name: 'Mleko', quantity: 200, unit: 'ml', swappedFrom: null }
);
check(
	'a swap replaces the name and remembers what it replaced',
	effectiveIngredient(ing('i1', 'Mleko', 200, 'ml'), swap),
	{ name: 'Mleko owsiane', quantity: 200, unit: 'ml', swappedFrom: 'Mleko' }
);
check(
	'ratio scales the quantity — "use 1.5x as much of the replacement" is what ratio MEANS',
	effectiveIngredient(ing('i1', 'Cukier', 100, 'g'), {
		i1: { ingredientId: 'i1', substitutionId: 's9', name: 'Miód', ratio: 0.75 }
	}),
	{ name: 'Miód', quantity: 75, unit: 'g', swappedFrom: 'Cukier' }
);

console.log('\nplanPantryDeduction — the straightforward cases');
const simple = planPantryDeduction(
	[ing('i1', 'Mąka', 300, 'g')],
	{},
	[pantryRow('Mąka', 'g', 1000)],
	noDensity
);
check('one row, enough stock: one deduction, no shortfall', [simple.deductions.length, simple.shortfalls.length], [1, 0]);
check('...spent in the PANTRY row\'s own unit, against the right row', [simple.deductions[0].quantity, simple.deductions[0].unit, simple.deductions[0].pantryItemId], [300, 'g', simple.deductions[0].pantryItemId]);

const untracked = planPantryDeduction([ing('i1', 'Sól', 5, 'g')], {}, [], noDensity);
check(
	'an ingredient with NO pantry row is silent — not a shortfall (decision 3: the cook clearly had it, it was just never logged)',
	[untracked.deductions.length, untracked.shortfalls.length],
	[0, 0]
);

const zeroQty = planPantryDeduction([ing('i1', 'Woda', 0, 'l')], {}, [pantryRow('Woda', 'l', 2)], noDensity);
check('a zero-quantity ingredient deducts nothing', zeroQty.deductions.length, 0);

console.log('\nplanPantryDeduction — the case FUTURES.md Section 1 actually specced');
const short = planPantryDeduction(
	[ing('i1', 'Mąka', 400, 'g')],
	{},
	[pantryRow('Mąka', 'g', 200)],
	noDensity
);
check('recipe wants 400 g, pantry logs 200 g: takes all 200', short.deductions[0].quantity, 200);
check('...and reports the real remainder as a SHORT shortfall, not a silent success', [short.shortfalls.length, short.shortfalls[0].reason, short.shortfalls[0].missingQuantity, short.shortfalls[0].unit], [1, 'short', 200, 'g']);
check('...never a negative deduction — the row is clamped by construction, it can only give what it has', short.deductions.every((d: PantryDeduction) => d.quantity <= 200), true);

console.log('\nplanPantryDeduction — FIFO across several rows of the same ingredient');
rowSeq = 0;
const oldRow = pantryRow('Masło', 'g', 100, '2026-01-01T00:00:00.000Z');
const newRow = pantryRow('Masło', 'g', 500, '2026-06-01T00:00:00.000Z');
const fifo = planPantryDeduction([ing('i1', 'Masło', 250, 'g')], {}, [newRow, oldRow], noDensity);
check('two rows, oldest spent FIRST regardless of input order', fifo.deductions.map((d: PantryDeduction) => d.pantryItemId), [oldRow.id, newRow.id]);
check('...the old row is fully spent, the new one only for the remainder', fifo.deductions.map((d: PantryDeduction) => d.quantity), [100, 150]);
check('...and nothing is reported short, since between them they covered it', fifo.shortfalls.length, 0);

console.log('\nplanPantryDeduction — real unit conversion, reusing the Session 25 engine');
rowSeq = 0;
const converted = planPantryDeduction([ing('i1', 'Mąka', 500, 'g')], {}, [pantryRow('Mąka', 'kg', 2)], noDensity);
checkClose('a kg row covers a g need — same-family, no density consulted', converted.deductions[0]?.quantity, 0.5);
check('...and the deduction is expressed in the ROW\'s unit (kg), which is what has to be subtracted', converted.deductions[0]?.unit, 'kg');

rowSeq = 0;
const needsDensity = planPantryDeduction([ing('i1', 'Mąka', 200, 'g')], {}, [pantryRow('Mąka', 'cup', 4)], noDensity);
check(
	'cross-family with NO density answered: nothing is deducted — guessing would destroy real stock',
	needsDensity.deductions.length,
	0
);
check('...and it reports `unresolved`, never `short` — "I can\'t tell" is a different fact from "you ran out"', [needsDensity.shortfalls[0].reason, needsDensity.shortfalls[0].missingQuantity], ['unresolved', 0]);

rowSeq = 0;
const withDensity = planPantryDeduction([ing('i1', 'Mąka', 200, 'g')], {}, [pantryRow('Mąka', 'cup', 4)], asFlour);
check('...and once the cook has answered the density question once, the same case deducts for real', [withDensity.deductions.length, withDensity.shortfalls.length], [1, 0]);
checkClose('...at the real converted amount (200 g of flour ≈ 1.6 cups)', withDensity.deductions[0]?.quantity, 1.596);

rowSeq = 0;
const incompatible = planPantryDeduction([ing('i1', 'Czosnek', 2, 'ząbki')], {}, [pantryRow('Czosnek', 'g', 60)], noDensity);
check('a genuinely unconvertible pair (ząbki vs g) deducts nothing and reports unresolved', [incompatible.deductions.length, incompatible.shortfalls[0].reason], [0, 'unresolved']);

console.log('\nplanPantryDeduction — swaps spend the thing that was actually used');
rowSeq = 0;
const swapped = planPantryDeduction(
	[ing('i1', 'Mleko', 200, 'ml')],
	swap,
	[pantryRow('Mleko', 'ml', 1000), pantryRow('Mleko owsiane', 'ml', 500)],
	noDensity
);
check('exactly one deduction — the replacement, not the original', swapped.deductions.length, 1);
check('...taken from the OAT milk row, leaving the cow\'s milk untouched', [swapped.deductions[0].ingredientName, swapped.deductions[0].quantity], ['Mleko owsiane', 200]);

rowSeq = 0;
const swappedUntracked = planPantryDeduction(
	[ing('i1', 'Mleko', 200, 'ml')],
	swap,
	[pantryRow('Mleko', 'ml', 1000)],
	noDensity
);
check(
	'swapping to something not in the pantry deducts nothing at all — crucially it does NOT fall back to spending the original',
	[swappedUntracked.deductions.length, swappedUntracked.shortfalls.length],
	[0, 0]
);

console.log('\nplanPantryDeduction — servings are deliberately NOT prorated');
rowSeq = 0;
const perServing = planPantryDeduction([ing('i1', 'Ryż', 100, 'g')], {}, [pantryRow('Ryż', 'g', 1000)], noDensity);
check(
	'the recipe\'s own quantity is spent once, matching what aggregateIngredients bought in the first place',
	perServing.deductions[0].quantity,
	100
);

console.log('\npantryStore.consume / restoreConsumed (MIRRORED — a rune store cannot run under tsx)');
/** Mirrors lib/state/pantry.svelte.ts's `consume` exactly, including the clamp and the empty-row
 *  drop. Kept in sync by hand; the real one is the shipped code. */
function mirroredConsume(items: PantryItem[], deductions: PantryDeduction[]): { items: PantryItem[]; before: PantryItem[] } {
	if (deductions.length === 0) return { items, before: [] };
	const byId = new Map<string, number>();
	for (const d of deductions) byId.set(d.pantryItemId, (byId.get(d.pantryItemId) ?? 0) + d.quantity);
	const before = items.filter((i) => byId.has(i.id)).map((i) => ({ ...i }));
	if (before.length === 0) return { items, before: [] };
	const next = items
		.map((i) => {
			const spend = byId.get(i.id);
			if (spend === undefined) return i;
			return { ...i, quantity: Math.max(0, i.quantity - spend), updatedAt: 'now' };
		})
		.filter((i) => i.quantity > 1e-6);
	return { items: next, before };
}

/** Mirrors `restoreConsumed`. */
function mirroredRestore(items: PantryItem[], before: PantryItem[]): PantryItem[] {
	if (before.length === 0) return items;
	const restored = new Map(before.map((i) => [i.id, i]));
	let next = items.map((i) => restored.get(i.id) ?? i);
	const present = new Set(next.map((i) => i.id));
	const missing = before.filter((i) => !present.has(i.id));
	if (missing.length > 0) next = [...next, ...missing];
	return next;
}

rowSeq = 0;
const stock = [pantryRow('Mąka', 'g', 1000), pantryRow('Cukier', 'g', 500)];
const plan1 = planPantryDeduction(
	[ing('i1', 'Mąka', 300, 'g'), ing('i2', 'Cukier', 500, 'g')],
	{},
	stock,
	noDensity
);
const afterCook = mirroredConsume(stock, plan1.deductions);
check('a partially-used row is decremented, not deleted', [afterCook.items.length, afterCook.items[0].ingredientName, afterCook.items[0].quantity], [1, 'Mąka', 700]);
check('a fully-used row is dropped rather than left as a 0-quantity ghost', afterCook.items.some((i) => i.ingredientName === 'Cukier'), false);

const restored = mirroredRestore(afterCook.items, afterCook.before);
check('undo puts both rows back — the decremented one at its exact prior quantity', restored.find((i) => i.ingredientName === 'Mąka')?.quantity, 1000);
check('...and re-inserts the row that was emptied and dropped, under its original id', restored.find((i) => i.ingredientName === 'Cukier')?.quantity, 500);
check('...leaving exactly the pantry that existed before cooking, no duplicates', restored.length, 2);

rowSeq = 0;
// The double-spend guard: two ingredients naming the same thing in one recipe both target one row.
const twiceStock = [pantryRow('Oliwa', 'ml', 30)];
const twicePlan = planPantryDeduction(
	[ing('i1', 'Oliwa', 20, 'ml'), ing('i2', 'Oliwa', 20, 'ml')],
	{},
	twiceStock,
	noDensity
);
const twiceAfter = mirroredConsume(twiceStock, twicePlan.deductions);
check(
	'two ingredients naming the same pantry row can never drive it negative — clamped at 0 and dropped',
	twiceAfter.items.length,
	0
);

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
