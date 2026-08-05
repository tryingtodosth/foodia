// The tabular recipe summary — the "recipe design solved decades ago" layout (Cooking for
// Engineers, 2006): ingredients as rows down the left, each operation as ONE cell bracketing every
// row it consumes, so the whole shape of the dish is legible before reading a word of prose.
//
// Pure, framework-agnostic functions (no Svelte import), same discipline `substitution.ts`/
// `shoppingList.ts`/`recipeFilter.ts` already follow — `scripts/verify-recipe-matrix.ts` exercises
// this file directly, which is only possible because it imports nothing reactive.
//
// THE ONE STRUCTURAL ASSUMPTION, stated plainly rather than discovered later: a recipe is treated
// as a LINEAR chain — each operation folds the previous operation's output together with whatever
// ingredients it names for the first time. That is exactly what `Step[]` (an `order` field and an
// `ingredientIds` array, lib/types/recipe.ts) actually encodes; there is no parent/branch field to
// read a real tree out of. A genuinely parallel recipe (cook the pasta while the sauce reduces,
// then combine) therefore renders as a chain rather than two arms meeting — visually a simplification,
// never a false claim about which ingredients an operation touches. Modeling real branches needs a
// `Step.dependsOnStepIds` field that doesn't exist yet; inventing it by guessing at step text would
// be worse than the honest chain.
import type { Ingredient, Step } from '$lib/types/recipe';

export interface MatrixIngredientNode {
	kind: 'ingredient';
	ingredient: Ingredient;
}

export interface MatrixOpNode {
	kind: 'op';
	step: Step;
	/** Terse cell text ("melt", "fold in") — see `terseStepLabel`. The full sentence is always
	 *  reachable from `step.text`; this never replaces it, only what the narrow cell shows. */
	label: string;
	children: MatrixNode[];
}

export type MatrixNode = MatrixIngredientNode | MatrixOpNode;

export interface RecipeMatrix {
	/**
	 * Leading steps that name no ingredient at all — "butter and flour an 8x8 pan", "preheat the
	 * oven to 350°F". In the reference layout these are the full-width banner rows above the table,
	 * and that's exactly right: they're setup, not an operation performed ON any ingredient row.
	 * A no-ingredient step in the MIDDLE of a recipe ("let it rest 10 minutes") is deliberately NOT
	 * pulled up here — it really does act on the running preparation, so it stays a normal cell.
	 */
	prepSteps: Step[];
	/** The bracket tree, or null when no step names any ingredient (every step was prep). */
	root: MatrixNode | null;
	/** Ingredients no step ever names. Rendered as plain rows with no bracket over them, rather
	 *  than silently folded into a step that never claimed them — a real authoring gap the cook
	 *  should be able to see, not one this layout papers over. */
	unusedIngredients: Ingredient[];
	/** Total ingredient rows, including `unusedIngredients` — the diagram's own height. */
	rowCount: number;
	/** How many operation columns deep the tree runs — the diagram's own width. */
	depth: number;
}

const CLAUSE_BREAK = /[,.;:—–]/;

/**
 * A short cell label from a full step sentence: the first clause, capped in length. The reference
 * layout's whole value is terseness ("melt", "mix", "fold in") — a full sentence in a 90px column
 * would defeat it.
 *
 * Deliberately derived rather than stored: a real `Step.shortLabel` field is the proper fix, but
 * adding one means every existing recipe (fixtures and D1 rows alike) has an empty label until
 * someone re-authors it, so the layout would ship broken for all existing content. Deriving works
 * for every recipe that already exists, in any language, without a migration — and language is why
 * this cuts on punctuation and length rather than trying to find a verb, which would need a
 * per-language grammar this app has no business carrying.
 */
export function terseStepLabel(text: string, maxChars = 32): string {
	const trimmed = text.trim();
	if (!trimmed) return '';

	const breakIndex = trimmed.search(CLAUSE_BREAK);
	// A leading clause of one or two characters is punctuation noise ("1. Mix..."), not a label —
	// fall back to the whole sentence and let the length cap below do the work instead.
	let label = breakIndex > 2 ? trimmed.slice(0, breakIndex) : trimmed;

	if (label.length > maxChars) {
		const cut = label.slice(0, maxChars);
		const lastSpace = cut.lastIndexOf(' ');
		label = (lastSpace > maxChars / 2 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
	}
	return label;
}

/** Steps in their authored order. `order` is the field that means this; the array's own order is
 *  not guaranteed to match it (D1 rows come back by `order_index`, but a client-assembled recipe
 *  need not), so this never trusts the array alone. */
function orderedSteps(steps: Step[]): Step[] {
	return [...steps].sort((a, b) => a.order - b.order);
}

/**
 * Builds the bracket tree. Ingredients are grouped by the FIRST step that names them, which is
 * what makes every operation's row range contiguous — the property the whole nested layout depends
 * on. Within one step's group they keep the recipe's own ingredient order, not the order that
 * step's `ingredientIds` happens to list them in: the cook already knows the ingredient list's
 * order, and reshuffling it per step would make the same ingredient sit in a different place
 * depending on which step first mentioned it.
 */
export function buildRecipeMatrix(ingredients: Ingredient[], steps: Step[]): RecipeMatrix {
	const byId = new Map(ingredients.map((i) => [i.id, i]));
	const indexOf = new Map(ingredients.map((i, index) => [i.id, index]));
	const ordered = orderedSteps(steps);

	// Leading, ingredient-free steps become banner rows. `ingredientIds` is filtered through the
	// real ingredient list first — a step naming an id that doesn't exist (a stale reference after
	// an edit) must not count as "this step has ingredients", or it would render an operation
	// bracketing nothing at all.
	const realIngredientIds = (step: Step) => step.ingredientIds.filter((id) => byId.has(id));

	let firstUsingIndex = ordered.findIndex((s) => realIngredientIds(s).length > 0);
	if (firstUsingIndex === -1) {
		return {
			prepSteps: ordered,
			root: null,
			unusedIngredients: [...ingredients],
			rowCount: ingredients.length,
			depth: 0
		};
	}

	const prepSteps = ordered.slice(0, firstUsingIndex);
	const chainSteps = ordered.slice(firstUsingIndex);

	const placed = new Set<string>();
	let node: MatrixNode | null = null;

	for (const step of chainSteps) {
		const fresh = realIngredientIds(step)
			.filter((id) => !placed.has(id))
			.sort((a, b) => (indexOf.get(a) ?? 0) - (indexOf.get(b) ?? 0));
		for (const id of fresh) placed.add(id);

		const children: MatrixNode[] = [];
		if (node) children.push(node);
		for (const id of fresh) {
			const ingredient = byId.get(id);
			if (ingredient) children.push({ kind: 'ingredient', ingredient });
		}

		node = { kind: 'op', step, label: terseStepLabel(step.text), children };
	}

	const unusedIngredients = ingredients.filter((i) => !placed.has(i.id));

	return {
		prepSteps,
		root: node,
		unusedIngredients,
		rowCount: placed.size + unusedIngredients.length,
		depth: node ? matrixDepth(node) : 0
	};
}

/**
 * One placed cell in the rendered table. Coordinates are 1-based CSS-grid LINE numbers, with `end`
 * exclusive — i.e. exactly what `grid-row: {rowStart} / {rowEnd}` wants, so the component does no
 * arithmetic of its own and this file stays the single place the layout is decided (and the single
 * place `scripts/verify-recipe-matrix.ts` has to check).
 *
 * Column 1 is always the ingredient column; operation k (0-based, in chain order) is column k + 2.
 */
export interface MatrixCell {
	kind: 'ingredient' | 'op' | 'filler';
	ingredient?: Ingredient;
	step?: Step;
	label?: string;
	rowStart: number;
	rowEnd: number;
	colStart: number;
	colEnd: number;
}

export interface MatrixLayout {
	cells: MatrixCell[];
	rowCount: number;
	/** Total grid columns: the ingredient column plus one per operation. */
	columnCount: number;
}

/**
 * Turns the bracket tree into placed grid cells — the layout the reference image actually uses,
 * which is a real merged-cell TABLE and not a set of nested brackets. The difference matters and is
 * only visible when you look closely at the original: the ingredient column stays one uniform
 * width, and the area under a finished operation becomes its own merged empty cell rather than the
 * ingredient rows growing wider as the chain deepens.
 *
 * Those empty cells are emitted explicitly (`kind: 'filler'`) rather than left as holes in the
 * grid, because the lines around them are real: an empty grid area draws no borders, so without
 * them the table would lose the line under "melt" the moment the next operation started.
 */
export function layoutRecipeMatrix(matrix: RecipeMatrix): MatrixLayout {
	const cells: MatrixCell[] = [];
	const columnCount = matrix.depth + 1;

	// The chain, innermost operation first — `buildRecipeMatrix` returns it nested outward-in, and
	// the layout reads it in the order the cook performs it.
	const chain: MatrixOpNode[] = [];
	for (let node: MatrixNode | null = matrix.root; node && node.kind === 'op'; ) {
		chain.unshift(node);
		const next: MatrixNode | undefined = node.children.find((c) => c.kind === 'op');
		node = next && next.kind === 'op' ? next : null;
	}

	let row = 1;
	chain.forEach((op, index) => {
		const fresh = op.children.filter((c): c is MatrixIngredientNode => c.kind === 'ingredient');
		const firstFreshRow = row;

		for (const child of fresh) {
			cells.push({
				kind: 'ingredient',
				ingredient: child.ingredient,
				rowStart: row,
				rowEnd: row + 1,
				colStart: 1,
				colEnd: 2
			});
			row += 1;
		}

		// The merged empty area to the left of this operation and below the previous one.
		if (index > 0 && fresh.length > 0) {
			cells.push({
				kind: 'filler',
				rowStart: firstFreshRow,
				rowEnd: row,
				colStart: 2,
				colEnd: index + 2
			});
		}

		cells.push({
			kind: 'op',
			step: op.step,
			label: op.label,
			// Every operation folds in everything before it, so its cell always starts at row 1 —
			// that's what makes the staircase, and it's why row ranges can never be discontiguous.
			rowStart: 1,
			rowEnd: row,
			colStart: index + 2,
			colEnd: index + 3
		});
	});

	for (const ingredient of matrix.unusedIngredients) {
		cells.push({
			kind: 'ingredient',
			ingredient,
			rowStart: row,
			rowEnd: row + 1,
			colStart: 1,
			colEnd: 2
		});
		row += 1;
	}

	// Closes the box beside ingredients no step ever claims — deliberately an empty merged cell
	// rather than extending the last operation over them, which would assert that the recipe does
	// something with them when it demonstrably never says so.
	if (matrix.unusedIngredients.length > 0 && columnCount > 1) {
		cells.push({
			kind: 'filler',
			rowStart: row - matrix.unusedIngredients.length,
			rowEnd: row,
			colStart: 2,
			colEnd: columnCount + 1
		});
	}

	return { cells, rowCount: Math.max(0, row - 1), columnCount };
}

/** Operation columns from this node down — an ingredient leaf is 0, an op is 1 + its deepest child. */
export function matrixDepth(node: MatrixNode): number {
	if (node.kind === 'ingredient') return 0;
	return 1 + Math.max(0, ...node.children.map(matrixDepth));
}

/** Ingredient rows under a node, in top-to-bottom render order — the node's own visual height. */
export function matrixLeafCount(node: MatrixNode): number {
	if (node.kind === 'ingredient') return 1;
	return node.children.reduce((sum, child) => sum + matrixLeafCount(child), 0);
}
