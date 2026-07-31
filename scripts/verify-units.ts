// Standalone verification for the real unit-conversion engine (CLAUDE.md 4.5/4.7, Session 25) —
// the same "prove the logic directly, don't just typecheck it" discipline every prior pure-utils
// module in this app was built with (`recipeFilter.ts`, `stepAlternative.ts`, `cookability.ts`...).
//
// Unlike most of those, this imports the REAL modules rather than mirroring them: `units.ts`'s only
// non-relative import is `import type` (erased entirely by esbuild, never resolved at runtime), and
// `shoppingList.ts`'s own `$lib` value imports resolve through the `paths` entry in
// `.svelte-kit/tsconfig.json`, which tsx reads. So these assertions run against the exact code the
// app ships, not a copy that could drift from it.
//
// Run with `npx tsx scripts/verify-units.ts`.
import { convertQuantity, familyOf, formatQuantity, normalizeUnit } from '../src/lib/utils/units';
import { DENSITY_CLASS_G_PER_ML } from '../src/lib/types/units';
import { aggregateIngredients, crossReferencePantry } from '../src/lib/utils/shoppingList';
import type { DensityClass } from '../src/lib/types/units';
import type { AggregatedIngredient } from '../src/lib/utils/shoppingList';
import type { PantryItem } from '../src/lib/types/pantry';

let passed = 0;
let failed = 0;

function check(label: string, actual: unknown, expected: unknown): void {
	const ok = JSON.stringify(actual) === JSON.stringify(expected);
	if (ok) {
		passed++;
		console.log(`  ✓ ${label}`);
	} else {
		failed++;
		console.log(`  ✗ ${label}\n      expected: ${JSON.stringify(expected)}\n      actual:   ${JSON.stringify(actual)}`);
	}
}

/** Conversion math produces irrational-ish decimals by nature — compare at the precision the UI
 *  actually renders (`formatQuantity`'s own 1 decimal place), not at full float precision. */
function checkClose(label: string, actual: number | null, expected: number): void {
	const ok = actual !== null && Math.abs(actual - expected) < 0.05;
	if (ok) {
		passed++;
		console.log(`  ✓ ${label}`);
	} else {
		failed++;
		console.log(`  ✗ ${label}\n      expected: ~${expected}\n      actual:   ${actual}`);
	}
}

console.log('\nnormalizeUnit / familyOf — the spelling-collapse layer');
// The real motivating case: one Budget Bytes import produced "Tbsp"/"tbsp"/"tbsp." on one page.
check('"Tbsp" / "tbsp." / "tablespoons" all collapse to one unit', [normalizeUnit('Tbsp'), normalizeUnit('tbsp.'), normalizeUnit('  TABLESPOONS ')], ['tbsp', 'tbsp', 'tbsp']);
check('an unknown unit passes through, only normalized', normalizeUnit('  Clove '), 'clove');
check('mass / volume / other families resolve correctly', [familyOf('lb'), familyOf('Cup'), familyOf('szt')], ['mass', 'volume', 'other']);

console.log('\nconvertQuantity — same-family, exact arithmetic, density never consulted');
checkClose('1 kg -> 1000 g', convertQuantity(1, 'kg', 'g'), 1000);
checkClose('1 lb -> 453.59 g', convertQuantity(1, 'lb', 'g'), 453.59237);
checkClose('16 oz -> 1 lb', convertQuantity(16, 'oz', 'lb'), 1);
checkClose('1 cup -> 236.59 ml', convertQuantity(1, 'cup', 'ml'), 236.588236);
checkClose('3 tsp -> 1 tbsp', convertQuantity(3, 'tsp', 'tbsp'), 1);
check('same unit under different spellings is a no-op, not a round-trip', convertQuantity(250, 'Grams', 'g'), 250);
check('same-family conversion ignores a supplied density entirely', convertQuantity(1, 'kg', 'g', 0.53), convertQuantity(1, 'kg', 'g'));

console.log('\nconvertQuantity — cross-family, the real reason DensityClass exists');
check('cup -> g returns null WITHOUT a density (never guesses)', convertQuantity(1, 'cup', 'g'), null);
check('g -> cup returns null WITHOUT a density', convertQuantity(100, 'g', 'cup'), null);
// The exact claim CLAUDE.md 7 item 3 has made since Session 5: a cup of flour and a cup of honey
// convert completely differently. This proves the engine actually reflects that, not just states it.
checkClose('1 cup flour (powdery) ≈ 125 g', convertQuantity(1, 'cup', 'g', DENSITY_CLASS_G_PER_ML.powdery), 125.4);
checkClose('1 cup honey (dense) ≈ 284 g', convertQuantity(1, 'cup', 'g', DENSITY_CLASS_G_PER_ML.dense), 283.9);
check('...and those two genuinely differ', convertQuantity(1, 'cup', 'g', DENSITY_CLASS_G_PER_ML.powdery) === convertQuantity(1, 'cup', 'g', DENSITY_CLASS_G_PER_ML.dense), false);
checkClose('1 cup water (liquid) ≈ 236.6 g', convertQuantity(1, 'cup', 'g', DENSITY_CLASS_G_PER_ML.liquid), 236.59);
checkClose('cross-family round-trips back to itself (500 g -> cup -> g)', convertQuantity(convertQuantity(500, 'g', 'cup', 0.85)!, 'cup', 'g', 0.85), 500);

console.log("\nconvertQuantity — 'other'-family units are a real dead end, not a gap to paper over");
check('clove -> g returns null even WITH a density supplied', convertQuantity(2, 'clove', 'g', 1.0), null);
check('g -> pinch returns null with a density supplied', convertQuantity(5, 'g', 'pinch', 1.0), null);
check('two different unknown units never convert', convertQuantity(1, 'clove', 'pinch'), null);
check('an unknown unit to ITSELF is still the identity', convertQuantity(3, 'szt', 'szt'), 3);

console.log('\nformatQuantity — the float-noise guard');
check('rounds real conversion noise to 1dp', formatQuantity(263.41176470588235), '263.4');
check('drops a trailing .0', formatQuantity(263.0), '263');
check('leaves a clean integer alone', formatQuantity(2), '2');
check('rounds up at the boundary', formatQuantity(0.05), '0.1');

console.log('\ncrossReferencePantry — the four real unit statuses');
const needed = (name: string, unit: string, qty: number): AggregatedIngredient => ({
	key: `${name.toLowerCase()}::${unit.toLowerCase()}`,
	name,
	unit,
	neededQuantity: qty,
	usedInRecipeNames: ['Test']
});
const pantryRow = (name: string, unit: string, qty: number): PantryItem => ({
	id: `p-${name}-${unit}`,
	ingredientName: name,
	quantity: qty,
	unit,
	updatedAt: '2026-07-31T00:00:00Z'
});
const noDensity = () => undefined;
const asFlour = (): DensityClass => 'powdery';

const exact = crossReferencePantry([needed('Sól', 'g', 200)], [pantryRow('Sól', 'g', 50)], noDensity)[0];
check("same unit -> 'match', straight subtraction", [exact.unitStatus, exact.pantryQuantity, exact.missingQuantity], ['match', 50, 150]);

const sameFamily = crossReferencePantry([needed('Sól', 'g', 200)], [pantryRow('Sól', 'kg', 0.05)], noDensity)[0];
check("same-family different unit -> 'converted', no density needed", [sameFamily.unitStatus, sameFamily.pantryQuantity, sameFamily.missingQuantity], ['converted', 50, 150]);

const spelling = crossReferencePantry([needed('Cukier', 'tbsp', 4)], [pantryRow('Cukier', 'Tbsp.', 1)], noDensity)[0];
check("a mere spelling difference is 'match', not 'converted'", [spelling.unitStatus, spelling.pantryQuantity], ['match', 1]);

const unresolved = crossReferencePantry([needed('Mąka', 'g', 500)], [pantryRow('Mąka', 'cup', 2)], noDensity)[0];
check("cross-family with no cached class -> 'needsDensity', nothing subtracted", [unresolved.unitStatus, unresolved.pantryQuantity, unresolved.missingQuantity], ['needsDensity', 0, 500]);

const resolved = crossReferencePantry([needed('Mąka', 'g', 500)], [pantryRow('Mąka', 'cup', 2)], asFlour)[0];
check("...and the SAME input with a cached class -> 'converted'", resolved.unitStatus, 'converted');
checkClose('...subtracting a real converted quantity (2 cups flour ≈ 251 g)', resolved.pantryQuantity, 250.8);
checkClose('...leaving a real remainder', resolved.missingQuantity, 249.2);

const incompatible = crossReferencePantry([needed('Czosnek', 'g', 30)], [pantryRow('Czosnek', 'clove', 4)], asFlour)[0];
check("an 'other'-family unit -> 'incompatible' even WITH a class cached", [incompatible.unitStatus, incompatible.pantryQuantity, incompatible.missingQuantity], ['incompatible', 0, 30]);

const absent = crossReferencePantry([needed('Bazylia', 'g', 10)], [], noDensity)[0];
check("nothing in the pantry at all -> plain 'match', never a spurious prompt", [absent.unitStatus, absent.pantryQuantity, absent.missingQuantity], ['match', 0, 10]);

console.log('\ncrossReferencePantry — multiple pantry rows for one ingredient');
const twoConvertible = crossReferencePantry(
	[needed('Mleko', 'ml', 1000)],
	[pantryRow('Mleko', 'l', 0.5), pantryRow('Mleko', 'ml', 200)],
	noDensity
)[0];
check('every convertible row is summed, not just the first match', [twoConvertible.unitStatus, twoConvertible.pantryQuantity, twoConvertible.missingQuantity], ['converted', 700, 300]);

// The precedence case: a partially-resolvable pantry must still surface the question, or the cup
// row is silently dropped from the subtraction AND never recoverable. See crossReferencePantry's
// own comment on why 'needsDensity' outranks a successful conversion here.
const mixed = crossReferencePantry(
	[needed('Mąka', 'g', 1000)],
	[pantryRow('Mąka', 'g', 500), pantryRow('Mąka', 'cup', 2)],
	noDensity
)[0];
check("a partly-convertible pantry still reports 'needsDensity'", mixed.unitStatus, 'needsDensity');
check('...while keeping whatever genuinely did convert', [mixed.pantryQuantity, mixed.missingQuantity], [500, 500]);

const mixedResolved = crossReferencePantry(
	[needed('Mąka', 'g', 1000)],
	[pantryRow('Mąka', 'g', 500), pantryRow('Mąka', 'cup', 2)],
	asFlour
)[0];
check('...and answering the prompt only ever ADDS coverage', mixedResolved.unitStatus, 'converted');
checkClose('...500 g + 2 cups flour ≈ 750.8 g', mixedResolved.pantryQuantity, 750.8);

console.log('\naggregateIngredients — unchanged behavior, guarded against regression');
const plan = {
	id: 'mp1',
	userId: 'u1',
	name: 'Test',
	weekStart: '2026-07-27',
	createdAt: '2026-07-27T00:00:00Z',
	updatedAt: '2026-07-27T00:00:00Z',
	days: [
		{
			date: '2026-07-27',
			meals: [
				{ id: 'm1', slot: 'dinner' as const, recipeId: 'r1', servings: 1 },
				{ id: 'm2', slot: 'lunch' as const, recipeId: 'r2', servings: 1 }
			]
		}
	]
};
const recipesById = {
	r1: { id: 'r1', name: 'A', ingredients: [{ id: 'i1', name: 'Czosnek', quantity: 2, unit: 'g', substitutable: true }] },
	r2: { id: 'r2', name: 'B', ingredients: [{ id: 'i2', name: 'Czosnek', quantity: 3, unit: 'g', substitutable: true }] }
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;
const agg = aggregateIngredients(plan as never, recipesById);
check('two recipes needing the same ingredient in the same unit sum to one row', [agg.length, agg[0].neededQuantity, agg[0].usedInRecipeNames], [1, 5, ['A', 'B']]);

console.log('\npantryStore.add — unit-aware merging (MIRRORED, not imported)');
// `pantry.svelte.ts` is a rune store (`$state`), which plain tsx can't evaluate — so unlike every
// section above, this mirrors `add()`'s real branching rather than importing it. Same convention
// Sessions 10/11 used for their own store-level checks; kept adjacent to the real code's structure
// (exact-match -> convertible same-name row -> new row) so a divergence is easy to spot on review.
function mirroredAdd(
	items: PantryItem[],
	input: { ingredientName: string; quantity: number; unit: string },
	densityFor: (name: string) => DensityClass | undefined
): PantryItem[] {
	const trimmed = input.ingredientName.trim();
	if (!trimmed) return items;
	const unit = input.unit || 'pc';
	const nameKey = trimmed.toLowerCase();

	const exactMatch = items.find(
		(i) => i.ingredientName.trim().toLowerCase() === nameKey && normalizeUnit(i.unit) === normalizeUnit(unit)
	);
	if (exactMatch) {
		return items.map((i) => (i.id === exactMatch.id ? { ...i, quantity: i.quantity + input.quantity } : i));
	}

	const sameNameOtherUnit = items.find((i) => i.ingredientName.trim().toLowerCase() === nameKey);
	if (sameNameOtherUnit) {
		const cls = densityFor(trimmed);
		const converted = convertQuantity(input.quantity, unit, sameNameOtherUnit.unit, cls ? DENSITY_CLASS_G_PER_ML[cls] : undefined);
		if (converted !== null) {
			return items.map((i) => (i.id === sameNameOtherUnit.id ? { ...i, quantity: i.quantity + converted } : i));
		}
	}
	return [...items, { id: 'new', ingredientName: trimmed, quantity: input.quantity, unit, updatedAt: '' }];
}

const exactMerge = mirroredAdd([pantryRow('Sól', 'g', 200)], { ingredientName: ' sól ', quantity: 200, unit: 'g' }, noDensity);
check('the original Session 12 fix still holds — same (name, unit) merges, case/space-insensitive', [exactMerge.length, exactMerge[0].quantity], [1, 400]);

const aliasMerge = mirroredAdd([pantryRow('Cukier', 'tbsp', 2)], { ingredientName: 'Cukier', quantity: 1, unit: 'Tbsp.' }, noDensity);
check('a spelling variant merges instead of forking a phantom row', [aliasMerge.length, aliasMerge[0].quantity], [1, 3]);

const familyMerge = mirroredAdd([pantryRow('Sól', 'g', 200)], { ingredientName: 'Sól', quantity: 1, unit: 'kg' }, noDensity);
check('same-family different unit merges via real math, into the EXISTING row\'s unit', [familyMerge.length, familyMerge[0].quantity, familyMerge[0].unit], [1, 1200, 'g']);

const noDensityFork = mirroredAdd([pantryRow('Mąka', 'g', 500)], { ingredientName: 'Mąka', quantity: 2, unit: 'cup' }, noDensity);
check('cross-family with no cached class stays a SEPARATE row (never guesses, never prompts here)', [noDensityFork.length, noDensityFork[1].unit], [2, 'cup']);

const densityMerge = mirroredAdd([pantryRow('Mąka', 'g', 500)], { ingredientName: 'Mąka', quantity: 2, unit: 'cup' }, asFlour);
check('...and once a class IS cached, the same add merges', densityMerge.length, 1);
checkClose('...at the real converted quantity', densityMerge[0].quantity, 750.8);

const distinct = mirroredAdd([pantryRow('Sól', 'g', 200)], { ingredientName: 'Cukier', quantity: 100, unit: 'g' }, noDensity);
check('a different ingredient never merges', distinct.length, 2);

const blank = mirroredAdd([pantryRow('Sól', 'g', 200)], { ingredientName: '   ', quantity: 5, unit: 'g' }, noDensity);
check('a blank name is a no-op', blank.length, 1);

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 1 - 1 : 1);
