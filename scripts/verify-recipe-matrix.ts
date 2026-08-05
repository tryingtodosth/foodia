// Standalone verification for the tabular recipe summary (Session 27) — the same "prove the logic
// directly, don't just typecheck it" discipline `verify-units.ts` already established, and for the
// same reason: `recipeMatrix.ts` is pure, imports nothing reactive, and decides the entire layout,
// so it can be exercised exactly as the app runs it rather than through a browser.
//
// The centrepiece is the REFERENCE RECIPE itself — the brownie table from the source guide,
// transcribed ingredient for ingredient and operation for operation. If this file's output ever
// stops matching that image, the feature is wrong, whatever it happens to look like on screen.
//
// Run with `npx tsx scripts/verify-recipe-matrix.ts`.
import {
	buildRecipeMatrix,
	layoutRecipeMatrix,
	terseStepLabel,
	matrixDepth,
	matrixLeafCount
} from '../src/lib/utils/recipeMatrix';
import type { Ingredient, Step } from '../src/lib/types/recipe';

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

function ing(id: string, name: string): Ingredient {
	return { id, name, quantity: 1, unit: 'g', substitutable: false };
}

function step(id: string, order: number, text: string, ingredientIds: string[]): Step {
	return { id, order, text, ingredientIds };
}

// ---------------------------------------------------------------------------------------------
console.log('\nterseStepLabel');

check('cuts at the first clause break', terseStepLabel('Dodaj mięso mielone, smaż aż się zrumieni.'), 'Dodaj mięso mielone');
check('a whole short sentence survives, minus its full stop', terseStepLabel('Wlej passatę, przypraw solą.'), 'Wlej passatę');
check('a long unbroken sentence is cut on a word boundary', terseStepLabel('Ugotuj spaghetti al dente w osolonej wodzie z dodatkiem oliwy'), 'Ugotuj spaghetti al dente w…');
check('leading numbering is not mistaken for a clause', terseStepLabel('1. Mix'), '1. Mix');
check('empty text stays empty', terseStepLabel('   '), '');

// ---------------------------------------------------------------------------------------------
console.log('\nThe reference recipe (the brownie table from the source guide)');

// Transcribed from the image: two prep instructions naming no ingredient, then nine ingredients
// folded in by five operations.
const brownieIngredients: Ingredient[] = [
	ing('b1', 'unsalted butter'),
	ing('b2', 'sugar'),
	ing('b3', 'vanilla extract'),
	ing('b4', 'fresh brewed espresso'),
	ing('b5', 'eggs'),
	ing('b6', 'all-purpose flour'),
	ing('b7', 'cocoa powder'),
	ing('b8', 'baking soda'),
	ing('b9', 'table salt')
];

const brownieSteps: Step[] = [
	step('bs0', 1, 'Butter and flour an 8x8-in pan', []),
	step('bs1', 2, 'Preheat oven to 350°F (170°C)', []),
	step('bs2', 3, 'melt', ['b1']),
	step('bs3', 4, 'mix', ['b2', 'b3', 'b4']),
	step('bs4', 5, 'mix', ['b5']),
	step('bs5', 6, 'fold in', ['b6', 'b7', 'b8', 'b9']),
	step('bs6', 7, 'bake 350°F (170°C) 30 to 40 min', [])
];

const brownie = buildRecipeMatrix(brownieIngredients, brownieSteps);

check('both leading no-ingredient steps become banner rows', brownie.prepSteps.map((s) => s.id), ['bs0', 'bs1']);
check('nine ingredient rows', brownie.rowCount, 9);
check('five operation columns', brownie.depth, 5);
check('no ingredient is left unclaimed', brownie.unusedIngredients.length, 0);
check('the root operation covers every row', brownie.root ? matrixLeafCount(brownie.root) : -1, 9);
check('matrixDepth agrees with the built depth', brownie.root ? matrixDepth(brownie.root) : -1, 5);

const layout = layoutRecipeMatrix(brownie);
check('grid is 1 ingredient column + 5 operation columns', layout.columnCount, 6);

const ops = layout.cells.filter((c) => c.kind === 'op');
// The exact geometry visible in the reference image: every operation starts at row 1 (each folds in
// everything before it), and its bottom edge is wherever its own newly-named ingredients end.
check(
	'melt: row 1 only, column 2',
	ops.map((o) => [o.step?.id, o.rowStart, o.rowEnd, o.colStart])[0],
	['bs2', 1, 2, 2]
);
check(
	'mix: rows 1-4 (butter..espresso), column 3',
	ops.map((o) => [o.step?.id, o.rowStart, o.rowEnd, o.colStart])[1],
	['bs3', 1, 5, 3]
);
check(
	'mix: rows 1-5 (…plus eggs), column 4',
	ops.map((o) => [o.step?.id, o.rowStart, o.rowEnd, o.colStart])[2],
	['bs4', 1, 6, 4]
);
check(
	'fold in: rows 1-9 (…plus the four dry ingredients), column 5',
	ops.map((o) => [o.step?.id, o.rowStart, o.rowEnd, o.colStart])[3],
	['bs5', 1, 10, 5]
);
check(
	'bake: rows 1-9, column 6, adding no ingredients of its own',
	ops.map((o) => [o.step?.id, o.rowStart, o.rowEnd, o.colStart])[4],
	['bs6', 1, 10, 6]
);

const fillers = layout.cells.filter((c) => c.kind === 'filler');
// The merged empty areas under a finished operation — visible in the original as one big box under
// "melt" for the next three rows, then a wider one under "mix" for the eggs row, and so on.
check(
	'three merged empty areas, each spanning the operations already finished',
	fillers.map((f) => [f.rowStart, f.rowEnd, f.colStart, f.colEnd]),
	[
		[2, 5, 2, 3],
		[5, 6, 2, 4],
		[6, 10, 2, 5]
	]
);

const rows = layout.cells.filter((c) => c.kind === 'ingredient');
check(
	'ingredient rows come out in the reference order, one row each',
	rows.map((r) => r.ingredient?.id),
	['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'b9']
);
check('every ingredient row sits in column 1', new Set(rows.map((r) => r.colStart)).size, 1);
// The property the whole nested layout rests on: no operation may skip a row it doesn't consume.
check(
	'no operation cell has a gap in its row range',
	ops.every((o) => o.rowStart === 1 && o.rowEnd > o.rowStart),
	true
);

// ---------------------------------------------------------------------------------------------
console.log('\nReal-world shapes this app actually contains');

// An ingredient named again by a later step belongs to the group of the step that named it FIRST —
// this is what keeps every operation's row range contiguous. Modelled on the real bolognese fixture,
// whose last step re-names two ingredients used earlier.
const reuse = buildRecipeMatrix(
	[ing('i1', 'meat'), ing('i2', 'passata'), ing('i3', 'onion'), ing('i5', 'spaghetti')],
	[
		step('st1', 1, 'fry the onion', ['i3']),
		step('st2', 2, 'brown the meat', ['i1']),
		step('st3', 3, 'pour in the passata', ['i2']),
		step('st4', 4, 'boil the spaghetti', ['i5']),
		step('st5', 5, 'combine', ['i5', 'i2'])
	]
);
check('an ingredient is placed by its FIRST use, never twice', reuse.rowCount, 4);
check('rows follow first-use order, not the recipe list order', layoutRecipeMatrix(reuse).cells.filter((c) => c.kind === 'ingredient').map((c) => c.ingredient?.id), ['i3', 'i1', 'i2', 'i5']);
check('a final step naming only already-used ingredients still gets its own column', reuse.depth, 5);

const unused = buildRecipeMatrix(
	[ing('u1', 'flour'), ing('u2', 'garnish nobody uses')],
	[step('us1', 1, 'mix the flour', ['u1'])]
);
check('an ingredient no step names is reported, not silently folded in', unused.unusedIngredients.map((i) => i.id), ['u2']);
check('...and still gets a row', unused.rowCount, 2);
const unusedLayout = layoutRecipeMatrix(unused);
check(
	'...with an empty merged cell closing the box beside it',
	unusedLayout.cells.filter((c) => c.kind === 'filler').map((f) => [f.rowStart, f.rowEnd]),
	[[2, 3]]
);

const stale = buildRecipeMatrix(
	[ing('s1', 'flour')],
	[step('ss1', 1, 'preheat', ['ghost-id']), step('ss2', 2, 'mix', ['s1'])]
);
check('a step naming an ingredient that no longer exists counts as prep, not an empty bracket', stale.prepSteps.map((s) => s.id), ['ss1']);
check('...and the real step still gets its column', stale.depth, 1);

const noSteps = buildRecipeMatrix([ing('n1', 'flour')], []);
check('a recipe with no steps at all produces no tree', noSteps.root, null);
check('...and lists every ingredient as unused', noSteps.unusedIngredients.length, 1);
check('...and lays out with only the ingredient column', layoutRecipeMatrix(noSteps).columnCount, 1);
check('...emitting no filler, since there is nothing to close', layoutRecipeMatrix(noSteps).cells.filter((c) => c.kind === 'filler').length, 0);

const outOfOrder = buildRecipeMatrix(
	[ing('o1', 'a'), ing('o2', 'b')],
	[step('os2', 2, 'second', ['o2']), step('os1', 1, 'first', ['o1'])]
);
check('steps are read by their `order` field, not their array position', layoutRecipeMatrix(outOfOrder).cells.filter((c) => c.kind === 'op').map((c) => c.step?.id), ['os1', 'os2']);

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
