// Part two: the real D1 write path for the new comment kinds, plus the /shopping-list regression
// the DensityPrompt extraction could have broken, plus a screenshot of the table to look at.
// Playwright is NOT a dependency of this repo — adding a browser-test toolchain is a bigger
// decision than the feature this verifies should make on its own. The module is resolved from
// wherever it already exists on the machine; override with PLAYWRIGHT_MODULE if it moved.
//
//   node scripts/session27-verify-write.mjs          (dev server on :5178, see BASE below)
const PLAYWRIGHT =
	process.env.PLAYWRIGHT_MODULE ?? '/home/alojzy/Wymiana_VM/personali/node_modules/playwright/index.mjs';
const { chromium } = await import(PLAYWRIGHT);

const BASE = process.env.BASE ?? 'http://localhost:5178';
const OUT = process.env.OUT ?? '/home/alojzy/.claude/jobs/01fd9172/tmp';
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
// The two rejection checks below deliberately provoke a 400, which the browser logs as a console
// error. Suppressing them only while they're expected keeps the final assertion meaningful instead
// of being loosened to "two errors are fine".
let expectingRejection = false;
page.on('console', (m) => {
	if (m.type() === 'error' && !expectingRejection) errors.push(`console: ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
const settle = (ms = 900) => page.waitForTimeout(ms);

console.log('\n--- Log in, then write a real story into D1 ---');
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await settle();
await page.locator('input[type="email"]').fill('ania@foodia.net');
await page.locator('input[type="password"]').fill('foodia123');
await page.locator('button[type="submit"]').first().click();
await settle(1600);

await page.goto(`${BASE}/recipes/r1`, { waitUntil: 'networkidle' });
await settle(1200);
await page.locator('.cell--ingredient', { hasText: 'Spaghetti' }).click();
await settle(500);
await page.locator('.sheet__tab', { hasText: 'Notatki' }).click();
await settle(400);

// Scoped to the dialog: the STEPS section further down the page keeps its own composers (only the
// per-ingredient ones moved into the sheet), so an unscoped selector matches a dozen of them.
const sheet = page.locator('[role="dialog"]');
check('the composer is offered to a logged-in cook', await sheet.locator('.composer-toggle').count(), 1);
await sheet.locator('.composer-toggle').click();
await settle(300);
check('the note/story switch appears in the sheet', await sheet.locator('.composer__kind').count(), 2);
check('the upload permission is stated rather than the button silently missing', await sheet.locator('.composer__hint').count(), 1);

const STORY = 'Kupuję zawsze najcieńsze spaghetti — tak robiła mama.';
await sheet.locator('.composer__kind', { hasText: 'Historia' }).click();
await settle(200);
await sheet.locator('.composer textarea').fill(STORY);
await sheet.locator('.composer button[type="submit"]').click();
await settle(1400);

check('the story appears in the thread immediately', (await sheet.locator('.node-comment.story').count()) >= 1, true);
check('...with the text that was typed', (await sheet.locator('.node-comment.story').last().textContent()).includes('najcieńsze spaghetti'), true);

// The real proof it reached D1 and not just component state: reload from the server and look again.
await page.reload({ waitUntil: 'networkidle' });
await settle(1200);
await page.locator('.cell--ingredient', { hasText: 'Spaghetti' }).click();
await settle(500);
await page.locator('.sheet__tab', { hasText: 'Notatki' }).click();
await settle(400);
const afterReload = await page.locator('[role="dialog"] .node-comment.story').allTextContents();
console.log('      stories after a full reload: ' + JSON.stringify(afterReload.map((s) => s.trim().slice(0, 40))));
check('the story survives a full page reload — it is a real D1 row', afterReload.some((s) => s.includes('najcieńsze spaghetti')), true);
check('...and is still typed as a story, not demoted to a plain note', (await page.locator('[role="dialog"] .node-comment.story').last().textContent()).includes('📖'), true);

console.log('\n--- The server rejects an off-site image URL ---');
expectingRejection = true;
const rejected = await page.evaluate(async () => {
	const res = await fetch('/api/comments', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			recipeId: 'r1',
			targetType: 'ingredient',
			targetId: 'i5',
			content: 'hotlink attempt',
			visibility: 'public',
			imageUrl: 'https://elsewhere.example/tracker.gif'
		})
	});
	return res.status;
});
check('an arbitrary external image URL is refused', rejected, 400);

const acceptedEmpty = await page.evaluate(async () => {
	const res = await fetch('/api/comments', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			recipeId: 'r1',
			targetType: 'ingredient',
			targetId: 'i5',
			content: '   ',
			visibility: 'public'
		})
	});
	return res.status;
});
check('an empty comment with no photo is still refused', acceptedEmpty, 400);

expectingRejection = false;

console.log('\n--- /shopping-list regression (DensityPrompt was extracted out of it) ---');
await page.goto(`${BASE}/shopping-list`, { waitUntil: 'networkidle' });
await settle(1600);
check('the page renders', await page.locator('h1').count(), 1);
check('no error boundary', (await page.content()).includes('Internal Error'), false);

console.log('\n--- /plan and /pantry still render ---');
await page.goto(`${BASE}/plan`, { waitUntil: 'networkidle' });
await settle(1000);
check('/plan renders', await page.locator('h1').count(), 1);
await page.goto(`${BASE}/pantry`, { waitUntil: 'networkidle' });
await settle(800);
check('/pantry renders', await page.locator('h1').count(), 1);

console.log('\n--- Screenshots ---');
await page.setViewportSize({ width: 1100, height: 1000 });
await page.goto(`${BASE}/recipes/r1`, { waitUntil: 'networkidle' });
await settle(1200);
await page.locator('.matrix').screenshot({ path: `${OUT}/matrix-desktop.png` });
await page.locator('.cell--ingredient', { hasText: 'Passata' }).click();
await settle(600);
await page.locator('[role="dialog"]').screenshot({ path: `${OUT}/sheet.png` });
console.log('      wrote matrix-desktop.png and sheet.png');

console.log('\n--- Console/page errors ---');
if (errors.length) errors.forEach((e) => console.log('      ! ' + e));
check('no console or page errors anywhere in the run', errors.length, 0);

await browser.close();
console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
