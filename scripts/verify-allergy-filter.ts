// Standalone verification for the RECIPE-level allergy guardrail (CLAUDE.md 4.1, Session 29) —
// the same "prove the logic directly, don't just typecheck it" discipline every pure-utils module
// in this app was built with, and the same real-imports-not-mirrors standard `verify-units.ts` set:
// `recipeFilter.ts`'s and `substitution.ts`'s only non-relative imports are `import type` (erased by
// esbuild) plus one `$lib` value import that resolves through `.svelte-kit/tsconfig.json`'s own
// `paths`, which tsx reads. These assertions therefore run against exactly the code the app ships.
//
// This matters more here than for most modules in this app: an allergy filter that quietly stops
// working looks identical to one that's working, right up until it doesn't.
//
// Run with `npx tsx scripts/verify-allergy-filter.ts`.
import { filterAllergySafeRecipes, isRecipeAllergySafe } from '../src/lib/utils/recipeFilter';
import { defaultAllergenNameMatch } from '../src/lib/utils/substitution';

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

const named = (...names: string[]) => ({ ingredients: names.map((name) => ({ name })) });

// The fixture this guardrail exists for, taken from the app's own real content: `overnightOats`'s
// peanut-milk substitution is what caught the original whole-string matcher in Session 9.
const oats = { id: 'r2', ...named('Płatki owsiane', 'Mleko orzechowe', 'Miód') };
const bolognese = { id: 'r1', ...named('Spaghetti', 'Mięso mielone', 'Passata pomidorowa', 'Czosnek') };
const nutSalad = { id: 'r9', ...named('Sałata', 'Orzech laskowy', 'Oliwa') };

console.log('\nPolish declension — the case a substring match silently misses:');
// "orzechy" is the natural plural a Polish speaker types; it appears verbatim in neither name.
check('"orzechy" excludes "Mleko orzechowe"', isRecipeAllergySafe(oats, ['orzechy']), false);
check('"orzechy" excludes "Orzech laskowy"', isRecipeAllergySafe(nutSalad, ['orzechy']), false);
check('"orzech" (singular) excludes "Mleko orzechowe"', isRecipeAllergySafe(oats, ['orzech']), false);
check(
	'a plain substring check would NOT have caught it (this is why the stem matcher exists)',
	'mleko orzechowe'.includes('orzechy'),
	false
);

console.log('\nSafe recipes are not over-filtered away:');
check('bolognese is safe for a nut allergy', isRecipeAllergySafe(bolognese, ['orzechy']), true);
check(
	'"soczewica" does not false-positive on "Spaghetti"/"Passata"',
	isRecipeAllergySafe(bolognese, ['soczewica']),
	true
);
check('no allergies declared — nothing is filtered', isRecipeAllergySafe(oats, []), true);

console.log('\nInput hygiene — the chip list is built from free text:');
check('a blank entry does not hide the corpus', isRecipeAllergySafe(bolognese, ['']), true);
check('a whitespace-only entry does not hide the corpus', isRecipeAllergySafe(bolognese, ['   ']), true);
check(
	'a blank entry alongside a real one still applies the real one',
	isRecipeAllergySafe(oats, ['', 'orzechy']),
	false
);
check('surrounding whitespace is trimmed, not matched literally', isRecipeAllergySafe(oats, ['  orzechy  ']), false);
check('matching is case-insensitive', isRecipeAllergySafe(oats, ['ORZECHY']), false);

console.log('\nMultiple allergies combine as OR (any hit excludes the recipe):');
check('one of two allergies hits', isRecipeAllergySafe(oats, ['laktoza', 'orzechy']), false);
check('neither allergy hits', isRecipeAllergySafe(bolognese, ['laktoza', 'orzechy']), true);

console.log('\nThe documented Card/Detail boundary, asserted rather than assumed:');
check('a recipe with no ingredients loaded is reported SAFE', isRecipeAllergySafe({}, ['orzechy']), true);
check('an empty ingredient list is reported SAFE', isRecipeAllergySafe({ ingredients: [] }, ['orzechy']), true);

console.log('\nThe list form used by /plan:');
const pool = [bolognese, oats, nutSalad];
check(
	'a nut allergy leaves only the bolognese in the planner pool',
	filterAllergySafeRecipes(pool, ['orzechy']).map((r) => r.id),
	['r1']
);
check(
	'no allergies leaves the pool untouched',
	filterAllergySafeRecipes(pool, []).map((r) => r.id),
	['r1', 'r2', 'r9']
);
check(
	'an allergy matching everything empties the pool (the picker/quick-fill empty state)',
	filterAllergySafeRecipes([oats, nutSalad], ['orzechy']).map((r) => r.id),
	[]
);
check('the input array is not mutated', pool.length, 3);

console.log('\nThe shared matcher is genuinely the one from substitution.ts:');
check('injected matcher overrides the default', isRecipeAllergySafe(oats, ['orzechy'], () => false), true);
check('defaultAllergenNameMatch is the exported real one', defaultAllergenNameMatch('Mleko orzechowe', 'orzechy'), true);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
