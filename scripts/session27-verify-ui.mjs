// Real browser verification against the running dev server. Playwright is borrowed from the
// sibling `personali` checkout — foodia has no browser-test dependency of its own, and adding one
// is a bigger decision than this change should make on its own.
// Playwright is NOT a dependency of this repo — adding a browser-test toolchain is a bigger
// decision than the feature this verifies should make on its own. The module is resolved from
// wherever it already exists on the machine; override with PLAYWRIGHT_MODULE if it moved.
//
//   node scripts/session27-verify-ui.mjs          (dev server on :5178, see BASE below)
const PLAYWRIGHT =
	process.env.PLAYWRIGHT_MODULE ?? '/home/alojzy/Wymiana_VM/personali/node_modules/playwright/index.mjs';
const { chromium } = await import(PLAYWRIGHT);

const BASE = process.env.BASE ?? 'http://localhost:5178';
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
		console.log(`  ✗ ${label}\n      expected: ${JSON.stringify(expected)}\n      actual:   ${JSON.stringify(actual)}`);
	}
}

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
page.on('console', (m) => {
	if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

async function settle(ms = 900) {
	await page.waitForTimeout(ms);
}

console.log('\n--- The tabular summary on /recipes/r1 ---');
await page.goto(`${BASE}/recipes/r1`, { waitUntil: 'networkidle' });
await settle();

check('the summary heading renders', await page.locator('h2', { hasText: 'Przepis w skrócie' }).count(), 1);
const rows = page.locator('.cell--ingredient');
const ops = page.locator('.cell--op');
console.log(`      ingredient rows: ${await rows.count()}, operation cells: ${await ops.count()}, prep banners: ${await page.locator('.matrix__prep').count()}, fillers: ${await page.locator('.cell--filler').count()}`);
check('every ingredient has a row', await rows.count(), 5);
check('the ingredient-free prep step renders as a banner row above the table', await page.locator('.matrix__prep').count(), 1);
check('operations render as cells', (await ops.count()) > 0, true);

// Geometry: read the computed grid placement straight off the DOM. This is the real proof that the
// staircase is a staircase — every operation starts at row 1 and each spans further than the last.
const opGeometry = await page.locator('.cell--op').evaluateAll((els) =>
	els.map((el) => {
		const s = el.getAttribute('style') ?? '';
		const row = /grid-row:\s*(\d+)\s*\/\s*(\d+)/.exec(s);
		const col = /grid-column:\s*(\d+)\s*\/\s*(\d+)/.exec(s);
		return { rowStart: +row[1], rowEnd: +row[2], col: +col[1], label: el.textContent.trim() };
	})
);
console.log('      ' + JSON.stringify(opGeometry));
check('every operation cell starts at row 1', opGeometry.every((o) => o.rowStart === 1), true);
check('operation row spans never shrink left to right', opGeometry.every((o, i) => i === 0 || o.rowEnd >= opGeometry[i - 1].rowEnd), true);
check('operation columns increase by one each time', opGeometry.every((o, i) => i === 0 || o.col === opGeometry[i - 1].col + 1), true);

// The rendered box actually draws a grid: measure that an operation cell is genuinely taller than
// one ingredient row, which is the whole visual claim the layout makes.
const firstRowBox = await rows.first().boundingBox();
const lastOpBox = await ops.last().boundingBox();
check('the final operation cell spans the full table height', lastOpBox.height > firstRowBox.height * 3, true);

console.log('\n--- Tapping an operation reveals its full text ---');
await ops.first().click();
await settle(300);
check('the full step sentence appears', (await page.locator('.matrix__detail').count()) === 1, true);

console.log('\n--- Touching an ingredient opens the sheet ---');
await rows.first().click();
await settle(400);
check('a modal dialog opens', await page.locator('[role="dialog"]').count(), 1);
const tabs = await page.locator('.sheet__tab').allTextContents();
console.log('      tabs: ' + JSON.stringify(tabs.map((s) => s.trim())));
check('four tabs render', tabs.length, 4);
check('it opens on the pantry tab', (await page.locator('.sheet__tab.active').textContent()).includes('Spiżarnia'), true);
check('it says the ingredient is not in the pantry yet', (await page.locator('.status').textContent()).includes('Nie masz tego'), true);

console.log('\n--- Add to pantry, from the sheet ---');
await page.locator('.inline-form button[type="submit"]').click();
await settle(400);
check('the sheet confirms the add', await page.locator('.ok').count(), 1);
check('...and the status flips to "you have this"', (await page.locator('.status').textContent()).includes('wystarczy'), true);

await page.locator('.sheet__close').click();
await settle(400);
check('closing the sheet removes the dialog', await page.locator('[role="dialog"]').count(), 0);
check('the matrix row now shows a pantry tick', await page.locator('.cell--ingredient .mark--enough').count(), 1);
check('the linear ingredient list below shows the same tick', await page.locator('.ingredient .mark--enough').count(), 1);

console.log('\n--- Swaps tab ---');
// Deliberately the meat row, not the first one: onion is not substitutable in this recipe, and a
// tab that correctly says "0 swaps" proves nothing about the swap UI.
const meatRow = page.locator('.cell--ingredient', { hasText: 'Mięso' });
await meatRow.click();
await settle(400);
await page.locator('.sheet__tab', { hasText: 'Zamienniki' }).click();
await settle(300);
const swapCount = await page.locator('.swaps .swap').count();
console.log(`      swap rows (incl. "original"): ${swapCount}`);
check('the original plus its real substitutions are listed', swapCount >= 2, true);
check('each proposed swap carries its own discussion thread', (await page.locator('.discussion').count()) >= 1, true);

// Picking a swap must change the row in the matrix behind the sheet — the two views are the same
// recipe and must never disagree.
const swapName = (await page.locator('.swaps .swap').nth(1).locator('.swap__choose').textContent()).trim().split('—')[0].trim();
await page.locator('.swaps .swap').nth(1).locator('.swap__choose').click();
await settle(400);
await page.locator('.sheet__close').click();
await settle(400);
const meatRowText = await page.locator('.cell--ingredient').filter({ hasText: swapName.slice(0, 10) }).first().textContent();
console.log(`      matrix row after the swap: ${JSON.stringify(meatRowText.trim().slice(0, 80))}`);
check('the matrix row shows the chosen swap', meatRowText.includes(swapName.slice(0, 10)), true);
check('...and marks it as swapped', await page.locator('.cell--ingredient.swapped').count(), 1);

console.log('\n--- Notes, stories and the meal planner ---');
// Passata carries the story fixture.
const passata = page.locator('.cell--ingredient', { hasText: 'Passata' });
await passata.click();
await settle(400);
await page.locator('.sheet__tab', { hasText: 'Notatki' }).click();
await settle(300);
const storyCount = await page.locator('.node-comment.story').count();
console.log(`      stories rendered: ${storyCount}`);
check('the story renders with its own treatment', storyCount, 1);
check('...with the story icon, not the plain comment one', (await page.locator('.node-comment.story').textContent()).includes('📖'), true);

await page.locator('.sheet__tab', { hasText: 'Plan' }).click();
await settle(300);
check('the planner explains what adding does', (await page.locator('.muted').first().textContent()).includes('lista zakupów'), true);
const createBtn = page.locator('button', { hasText: 'Utwórz plan' });
if (await createBtn.count()) {
	await createBtn.click();
	await settle(400);
}
await page.locator('button', { hasText: 'Dodaj do planu' }).click();
await settle(400);
check('adding to the plan is confirmed with a link to the shopping list', (await page.locator('.ok a').textContent()).includes('Lista zakupów'), true);
await page.locator('.sheet__close').click();
await settle(300);

console.log('\n--- Search by ingredient on the home page ---');
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await settle();
const cardsBefore = await page.locator('.grid > *').count();
await page.locator('.filters summary').click();
await settle(300);
check('the ingredient search box is the first filter', await page.locator('input[type="search"]').count(), 1);
await page.locator('input[type="search"]').fill('czosn');
await settle(400);
const suggestions = await page.locator('.suggestion').allTextContents();
console.log('      suggestions: ' + JSON.stringify(suggestions.map((s) => s.trim())));
check('typing offers real ingredient names from the corpus', suggestions.length >= 1, true);
await page.locator('.suggestion').first().click();
await settle(500);
const cardsAfter = await page.locator('.grid > *').count();
console.log(`      recipes: ${cardsBefore} before, ${cardsAfter} after filtering on "czosn"`);
check('the corpus narrows', cardsAfter < cardsBefore && cardsAfter > 0, true);
check('the chosen term shows as a chip', await page.locator('.term').count(), 1);

// Accent-insensitivity is the point of foldText — prove it against real Polish content.
await page.locator('.term__remove').click();
await settle(300);
await page.locator('input[type="search"]').fill('mieso');
await settle(400);
const accentSuggestions = await page.locator('.suggestion').allTextContents();
console.log('      "mieso" (no diacritics) suggests: ' + JSON.stringify(accentSuggestions.map((s) => s.trim())));
check('an unaccented query finds the accented ingredient', accentSuggestions.some((s) => s.includes('Mięso')), true);

await page.locator('.suggestion').first().click();
await settle(500);
check('and it filters', (await page.locator('.grid > *').count()) > 0, true);

// Exclusion: flip the chip and the same recipe must disappear.
const withMeat = await page.locator('.grid > *').count();
await page.locator('.term__toggle').click();
await settle(500);
const withoutMeat = await page.locator('.grid > *').count();
console.log(`      including meat: ${withMeat} recipes, excluding meat: ${withoutMeat}`);
check('flipping the chip to exclude inverts the result', withoutMeat !== withMeat, true);

console.log('\n--- "Use my pantry" ---');
await page.locator('.term__remove').click();
await settle(300);
const pantryBtn = page.locator('.from-pantry');
check('the pantry shortcut appears once the pantry has something in it', await pantryBtn.count(), 1);
await pantryBtn.click();
await settle(500);
check('...and switches the facet to OR, since ANDing a whole pantry matches nothing', (await page.locator('.facet__mode button.active').first().textContent()).trim(), 'dowolny');

console.log('\n--- Mobile viewport ---');
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${BASE}/recipes/r1`, { waitUntil: 'networkidle' });
await settle();
const scroller = await page.locator('.matrix__scroll').boundingBox();
check('the table never pushes the page sideways', scroller.width <= 390, true);
await page.locator('.cell--ingredient').first().click();
await settle(400);
const sheetBox = await page.locator('[role="dialog"]').boundingBox();
check('the sheet renders as a bottom sheet on a phone', sheetBox.width <= 390 && sheetBox.y > 0, true);
await page.keyboard.press('Escape');
await settle(300);
check('Escape closes it', await page.locator('[role="dialog"]').count(), 0);

console.log('\n--- Console/page errors ---');
if (errors.length) {
	errors.forEach((e) => console.log('      ! ' + e));
}
check('no console or page errors anywhere in the run', errors.length, 0);

await browser.close();
console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
