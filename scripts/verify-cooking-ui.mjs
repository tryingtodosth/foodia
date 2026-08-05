// Real browser verification of the cooking SESSION (CLAUDE.md 4.3/4.5) — the half that
// `scripts/verify-cooking-session.ts` structurally cannot cover, because the whole claim being
// tested is "leave this screen and come back and it's still there," which only a real page load
// against a real localStorage can prove.
//
// Playwright is NOT a dependency of this repo — adding a browser-test toolchain is a bigger
// decision than this change should make on its own, the same call Session 27's own UI verification
// made. The module is resolved from wherever it already exists on the machine; override with
// PLAYWRIGHT_MODULE if it moved.
//
//   BASE=http://localhost:5173 node scripts/verify-cooking-ui.mjs
//
// `npm run dev` picks whichever port is free, so pass BASE rather than trusting the default.
const PLAYWRIGHT =
	process.env.PLAYWRIGHT_MODULE ?? '/home/alojzy/Wymiana_VM/personali/node_modules/playwright/index.mjs';
const { chromium } = await import(PLAYWRIGHT);

const BASE = process.env.BASE ?? 'http://localhost:5174';
let passed = 0;
let failed = 0;
const errors = [];

function check(label, actual, expected) {
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

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
page.on('console', (m) => {
	if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

async function settle(ms = 700) {
	await page.waitForTimeout(ms);
}

const readPantry = () =>
	page.evaluate(() =>
		(JSON.parse(localStorage.getItem('foodia-pantry') ?? '[]') ?? []).map((i) => [
			i.ingredientName,
			Math.round(i.quantity * 100) / 100,
			i.unit
		])
	);
const readSession = () =>
	page.evaluate(() => JSON.parse(localStorage.getItem('foodia-cooking-sessions') ?? '{}').r1 ?? null);

/** Tap the right two thirds of the cooking overlay — the app's own "tap anywhere to advance". */
async function tapAdvance() {
	const box = await page.locator('.cooking').boundingBox();
	await page.mouse.click(box.x + box.width * 0.75, box.y + box.height * 0.5);
	await settle(250);
}

// A deliberately mixed pantry: enough of two things, only PART of the passata (the exact case
// FUTURES.md Section 1 specced a "you may have been short" warning for), the lentils the swap will
// spend, and a mince row that must survive untouched once that swap is recorded.
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page.evaluate(() => {
	const now = new Date().toISOString();
	localStorage.setItem('foodia-cooking-sessions', '{}');
	localStorage.setItem(
		'foodia-pantry',
		JSON.stringify([
			{ id: 'p1', ingredientName: 'Mięso mielone wołowo-wieprzowe', quantity: 1000, unit: 'g', updatedAt: now },
			{ id: 'p2', ingredientName: 'Soczewica czerwona (namoczona)', quantity: 500, unit: 'g', updatedAt: now },
			{ id: 'p3', ingredientName: 'Passata pomidorowa', quantity: 200, unit: 'ml', updatedAt: now },
			{ id: 'p4', ingredientName: 'Spaghetti', quantity: 1, unit: 'kg', updatedAt: now }
		])
	);
});

console.log('\n--- Starting a session from the recipe page ---');
await page.goto(`${BASE}/recipes/r1`, { waitUntil: 'networkidle' });
await settle();
check('the CTA offers a fresh start, not a resume', (await page.locator('.cook-cta').textContent()).includes('Zacznij gotować'), true);
await page.locator('.cook-cta').click();
await page.waitForURL('**/recipes/r1/cook');
await settle();
check('cooking mode opens on step 1 of 6', (await page.locator('.cooking__progress').textContent()).includes('1 / 6'), true);

console.log('\n--- Advancing, then leaving and coming back (the whole point) ---');
await tapAdvance();
await tapAdvance();
check('two taps put us on step 3', (await page.locator('.cooking__progress').textContent()).includes('3 / 6'), true);
check('the two steps left behind are recorded as done', (await readSession()).doneStepIds.length, 2);

await page.reload({ waitUntil: 'networkidle' });
await settle();
check('a full page reload RESUMES at step 3 — it used to restart at step 1', (await page.locator('.cooking__progress').textContent()).includes('3 / 6'), true);

console.log('\n--- Recording "I substituted X" at the stove ---');
const chips = page.locator('.ing-chip');
check('this step shows its own ingredients (Step.ingredientIds, never rendered here before)', await chips.count(), 1);
check('...at the recipe\'s own quantity', (await chips.first().textContent()).replace(/\s+/g, ' ').trim(), '400 g Mięso mielone wołowo-wieprzowe');
await chips.first().click();
await settle(300);
check('tapping it opens the swap picker', await page.locator('.swap-sheet').count(), 1);
check('...listing the real community substitution', (await page.locator('.swap-option__name').first().textContent()).includes('Soczewica'), true);
check('...with the quantity already scaled by that substitution\'s ratio (400 × 0.6)', (await page.locator('.swap-option__ratio').first().textContent()).trim(), '240 g');
await page.locator('.swap-option').first().click();
await settle(300);
check('the chip now shows what was actually used', (await chips.first().textContent()).includes('Soczewica'), true);
check('...and says what it replaced', (await chips.first().textContent()).includes('zamiast'), true);

await page.reload({ waitUntil: 'networkidle' });
await settle();
check('the swap survives a reload too', (await page.locator('.ing-chip').first().textContent()).includes('Soczewica'), true);

console.log('\n--- The timer is an absolute end time now, so it survives a reload as well ---');
await page.locator('.cooking__timer-btn').click();
await settle(300);
const firstRead = await page.locator('.cooking__timer-active').textContent();
check('starting the timer shows a countdown', /⏲\s*0[78]:\d\d/.test(firstRead), true);
await page.reload({ waitUntil: 'networkidle' });
await settle(1200);
const afterReload = await page.locator('.cooking__timer-active').textContent();
check('...and it is still running, still counting DOWN, after a reload', /⏲\s*0[78]:\d\d/.test(afterReload) && afterReload < firstRead, true);
await page.locator('.cooking__timer-active button, .cooking__timer-active').first().click({ trial: true }).catch(() => {});

console.log('\n--- Leaving mid-recipe, from the recipe page ---');
await page.locator('.cooking__exit').click();
await page.waitForURL('**/recipes/r1');
await settle();
const resumeCta = await page.locator('.cook-cta').textContent();
check('the recipe page now offers to RESUME, naming the exact step', resumeCta.replace(/\s+/g, ' ').trim(), '⏸ Wróć do gotowania — krok 3/6');
await page.locator('.cook-cta').click();
await page.waitForURL('**/recipes/r1/cook');
await settle();
check('...and resuming really lands on step 3, not step 1', (await page.locator('.cooking__progress').textContent()).includes('3 / 6'), true);
check('the recorded swap was NOT overwritten by the recipe page\'s own (empty) selection', (await page.locator('.ing-chip').first().textContent()).includes('Soczewica'), true);

console.log('\n--- Finishing: the review step before anything is written ---');
for (let i = 0; i < 3; i += 1) await tapAdvance();
check('we are on the last step', (await page.locator('.cooking__progress').textContent()).includes('6 / 6'), true);
await tapAdvance();
await settle(400);
check('tapping past the last step opens the review — it used to be a dead end', await page.locator('.finish').count(), 1);
const previewRows = (await page.locator('.finish__list li').allTextContents()).map((s) => s.replace(/\s+/g, ' ').trim());
console.log('      preview: ' + JSON.stringify(previewRows));
check('the swap is spent, at the scaled amount', previewRows.includes('−240 g Soczewica czerwona (namoczona)'), true);
check('the ingredient that was swapped OUT is not touched at all', previewRows.some((r) => r.includes('Mięso mielone')), false);
check('a kg pantry row covers a g need through real conversion', previewRows.includes('−0.4 kg Spaghetti'), true);
check('a partially-stocked ingredient gives up everything it has', previewRows.includes('−200 ml Passata pomidorowa'), true);
const warnings = (await page.locator('.warning').allTextContents()).map((s) => s.replace(/\s+/g, ' ').trim());
console.log('      warnings: ' + JSON.stringify(warnings));
check('...and is reported as a real shortfall, with the real missing amount', warnings.some((w) => w.includes('Passata') && w.includes('300 ml')), true);

const pantryBefore = await readPantry();
check('nothing has been written to the pantry yet — the review is genuinely a preview', pantryBefore.length, 4);

console.log('\n--- Confirming the deduction ---');
await page.locator('.btn-primary').click();
await settle(500);
check('the done screen reports what was taken', (await page.locator('h1').textContent()).includes('Ugotowane'), true);
const pantryAfter = await readPantry();
console.log('      pantry after: ' + JSON.stringify(pantryAfter));
check('the mince is untouched — it was swapped out', pantryAfter.find((r) => r[0].startsWith('Mięso'))?.[1], 1000);
check('the lentils lost exactly the scaled amount', pantryAfter.find((r) => r[0].startsWith('Soczewica'))?.[1], 260);
check('the spaghetti was decremented in its own unit (kg), via conversion', pantryAfter.find((r) => r[0] === 'Spaghetti')?.[1], 0.65);
check('the fully-spent passata row is dropped, not left as a 0 g ghost', pantryAfter.some((r) => r[0] === 'Passata pomidorowa'), false);

console.log('\n--- Undoing it ---');
await page.locator('.btn-ghost', { hasText: 'Cofnij odliczenie' }).click();
await settle(400);
const pantryUndone = await readPantry();
console.log('      pantry after undo: ' + JSON.stringify(pantryUndone));
check('every row is back exactly as it was, including the one that was deleted', pantryUndone.sort(), pantryBefore.sort());

await page.locator('.btn-primary', { hasText: 'Gotowe' }).click();
await page.waitForURL('**/recipes/r1');
await settle();
check('closing the session discards it — the CTA is a fresh start again', (await page.locator('.cook-cta').textContent()).includes('Zacznij gotować'), true);

console.log('\n--- The plan leg: cooking a PLANNED meal ticks it off ---');
await page.goto(`${BASE}/plan`, { waitUntil: 'networkidle' });
await settle();
await page.locator('.plan-tab--new').click();
await settle(400);
await page.locator('.plan-cell__add').first().click();
await settle(400);
await page.locator('.picker__item').first().click();
await settle(500);
check('the meal chip offers to cook it — the plan never linked to cooking before', await page.locator('.meal-chip__cook').count(), 1);
const cookedRecipeName = (await page.locator('.meal-chip__name').first().textContent()).trim();
await page.locator('.meal-chip__cook').first().click();
await page.waitForURL('**/cook');
await settle();
check('the session opened for the planned recipe', (await page.locator('.cooking__progress').count()) > 0, true);
const planContext = await page.evaluate(() => {
	const all = Object.values(JSON.parse(localStorage.getItem('foodia-cooking-sessions') ?? '{}'));
	return all[0]?.planContext ?? null;
});
check('the session carries the plan context (in the store, not the URL — the cook route is prerendered)', planContext !== null && typeof planContext.mealId === 'string', true);

const stepTotal = Number((await page.locator('.cooking__progress').textContent()).match(/\/\s*(\d+)/)[1]);
for (let i = 0; i < stepTotal; i += 1) await tapAdvance();
await settle(400);
check('the review opens for this one too', await page.locator('.finish').count(), 1);
await page.locator('.btn-ghost', { hasText: 'Zakończ bez odliczania' }).click();
await settle(400);
check('finishing a planned meal says so', (await page.locator('.finish__planned').count()) > 0, true);
await page.locator('.btn-primary', { hasText: 'Gotowe' }).click();
await settle(600);

await page.goto(`${BASE}/plan`, { waitUntil: 'networkidle' });
await settle(800);
check('back on the plan, that meal now reads as cooked', await page.locator('.meal-chip__cooked').count(), 1);
check('...and it is the right one', (await page.locator('.meal-chip--cooked .meal-chip__name').textContent()).trim(), cookedRecipeName);
await page.locator('.meal-chip__cooked').click();
await settle(400);
check('the mark can be cleared again', await page.locator('.meal-chip__cooked').count(), 0);

console.log('\n--- Page errors ---');
check('no console or page errors during the whole run', errors, []);

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
