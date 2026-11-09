// Session 29 — headless-browser checks for /fuw and /admin/fuw (docs/fuw.md): the Polish form end
// to end with a hero photo and an extra photo, the English form at phone width (no sideways
// scroll), the admin review tab showing private photos, promotion to a public recipe with no email
// leak, and a regression check that /recipes/new still renders the shared composer. 26 assertions.
//
//   node scripts/verify-fuw-ui.mjs http://localhost:5173 <admin-session-token> <some.png> <shots-dir>
//
// Playwright is borrowed, not a dependency of this repo (same as verify-cooking-ui.mjs): set
// PLAYWRIGHT_MODULE to a playwright/index.mjs. If headless Chromium can't find system libraries
// (libatk etc.), point LD_LIBRARY_PATH at a directory that has them.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? '/home/piotr/Projects/personali/node_modules/playwright/index.mjs');
const [,, BASE, TOKEN, PNG, SHOTS] = process.argv;
let ok = 0, fail = 0;
const check = (n, c, e = '') => { if (c) { ok++; console.log('PASS', n); } else { fail++; console.log('FAIL', n, e); } };
const browser = await chromium.launch();
const errors = [];
async function newPage(ctxOpts = {}) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  return { ctx, page };
}

// ---- Polish, anonymous submission with hero + extra photo ----
{
  const { ctx, page } = await newPage({ locale: 'pl-PL', extraHTTPHeaders: { 'accept-language': 'pl' } });
  await Promise.all([page.waitForResponse(/api\/auth\/me/), page.goto(`${BASE}/fuw`)]);
  await page.waitForTimeout(1500);
  check('pl title', (await page.textContent('h1')).includes('Książka kucharska Wydziału Fizyki'));
  check('no login gate', !(await page.content()).includes('Musisz być zalogowana'));
  const opts = await page.$$eval('select option', (os) => os.map((o) => o.textContent.trim()));
  check('professor option', opts.includes('Profesor(ka)'), opts);
  check('recipe language picker', opts.includes('polski') && opts.includes('English'), opts);
  check('macros marked optional', (await page.content()).includes('opcjonalnie — zostaw puste'));

  await page.getByLabel('Nazwa przepisu').fill('Zupa Schrödingera');
  await page.getByLabel('Krótkie podsumowanie').fill('Jednocześnie gorąca i zimna.');
  await page.getByLabel('Pełny opis').fill('Klasyk pokoju socjalnego na Pasteura.');
  await page.getByLabel('Czas (minuty)').fill('45');
  const files = page.locator('input[type=file]');
  await files.nth(0).setInputFiles(PNG);
  await page.waitForSelector('img.preview');
  const heroUrl = await page.inputValue('input[placeholder="https://..."]');
  check('hero uploaded to fuw', /^\/api\/media\/fuw\//.test(heroUrl), heroUrl);
  const previewSrc = await page.getAttribute('img.preview', 'src');
  check('hero preview is local blob', previewSrc.startsWith('blob:'), previewSrc);

  const ing = page.locator('.draglist').first().locator('li');
  await ing.nth(0).locator('.ing-name').fill('Ziemniaki');
  await ing.nth(0).locator('.ing-qty').fill('500');
  await ing.nth(0).locator('.ing-unit').fill('g');
  await page.getByRole('button', { name: '+ Dodaj składnik' }).click();
  await ing.nth(1).locator('.ing-name').fill('Koperek');
  await ing.nth(1).locator('.ing-qty').fill('1');
  await ing.nth(1).locator('.ing-unit').fill('pęczek');
  await page.locator('textarea[placeholder="Opisz ten krok..."]').first().fill('Ugotuj ziemniaki i nie zaglądaj do garnka.');
  await page.locator('.step-uses label', { hasText: 'Ziemniaki' }).locator('input').check();

  await files.nth(1).setInputFiles(PNG);
  await page.waitForSelector('.photos img');
  check('extra photo listed', (await page.locator('.photos img').count()) === 1);

  // missing consent → client error, nothing sent
  await page.getByLabel(/Imię i nazwisko/).fill('prof. dr hab. Jan Kowalski');
  await page.getByLabel('Kim jesteś na Wydziale?').selectOption('professor');
  await page.getByLabel('Szczegóły (opcjonalnie)').fill('Zakład Optyki');
  await page.getByLabel('E-mail kontaktowy').fill('jan.kowalski@example.com');
  await page.getByLabel(/Historia przepisu/).fill('Wymyślona podczas sesji.');
  const placeholder = await page.getAttribute('input[maxlength="200"][type=text]', 'placeholder');
  check('staff detail placeholder', placeholder.includes('Zakład'), placeholder);
  await page.locator('.consent input').check();
  await page.screenshot({ path: `${SHOTS}/fuw-pl-form.png`, fullPage: true });
  await page.getByRole('button', { name: 'Wyślij przepis' }).click();
  await page.waitForSelector('.thanks', { timeout: 15000 }).catch(() => {});
  const thanks = await page.locator('.thanks h2').textContent().catch(() => '');
  check('pl thank-you', thanks.includes('Dziękujemy'), (await page.locator('.error').allTextContents()).join('|'));
  await page.screenshot({ path: `${SHOTS}/fuw-pl-thanks.png` });
  await page.getByRole('button', { name: 'Wyślij kolejny przepis' }).click();
  check('submit another resets recipe', (await page.getByLabel('Nazwa przepisu').inputValue()) === '');
  check('submit another keeps name', (await page.getByLabel(/Imię i nazwisko/).inputValue()).includes('Kowalski'));
  await ctx.close();
}

// ---- English interface, phone width ----
{
  const { ctx, page } = await newPage({ viewport: { width: 390, height: 844 } });
  await ctx.addCookies([{ name: 'foodia-locale', value: 'en', url: BASE }]);
  await page.goto(`${BASE}/fuw`);
  await page.waitForTimeout(1200);
  check('en title', (await page.textContent('h1')).includes('Faculty of Physics Cookbook'));
  const langDefault = await page.locator('select').first().inputValue();
  check('recipe language defaults to en', langDefault === 'en', langDefault);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('no horizontal scroll at 390px', overflow <= 1, overflow);
  await page.screenshot({ path: `${SHOTS}/fuw-en-phone.png`, fullPage: true });
  await ctx.close();
}

// ---- admin tab ----
{
  const { ctx, page } = await newPage();
  await ctx.addCookies([{ name: 'foodia-session', value: TOKEN, url: BASE }, { name: 'foodia-locale', value: 'pl', url: BASE }]);
  await page.goto(`${BASE}/admin/fuw`);
  await page.waitForTimeout(1000);
  check('admin tab present', (await page.locator('.tabs a', { hasText: 'Książka FUW' }).count()) === 1);
  const sub = page.locator('li.sub', { hasText: 'Zupa Schrödingera' }).first();
  check('submission in pending queue', (await page.locator('li.sub', { hasText: 'Zupa Schrödingera' }).count()) >= 1);
  await sub.locator('summary').click();
  check('email visible to admin', (await sub.textContent()).includes('jan.kowalski@example.com'));
  const imgsOk = await sub.locator('img').evaluateAll((imgs) => imgs.map((i) => i.complete && i.naturalWidth > 0));
  check('admin sees private photos', imgsOk.length === 2 && imgsOk.every(Boolean), imgsOk);
  await page.screenshot({ path: `${SHOTS}/fuw-admin.png`, fullPage: true });
  page.on('dialog', (d) => d.accept());
  await sub.getByRole('button', { name: 'Opublikuj jako przepis Foodii' }).click();
  await page.waitForTimeout(1500);
  await page.locator('.chip', { hasText: 'Przyjęte' }).click();
  await page.locator('li.sub', { hasText: 'Zupa Schrödingera' }).first().locator('summary').click();
  const link = page.locator('li.sub', { hasText: 'Zupa Schrödingera' }).first().getByRole('link', { name: /Zobacz przepis/ });
  await link.waitFor({ timeout: 10000 }).catch(() => {});
  check('promoted shows recipe link', (await link.count()) === 1);
  const href = await link.getAttribute('href').catch(() => null);
  if (href) {
    const anon = await browser.newPage();
    await anon.goto(`${BASE}${href}`);
    await anon.waitForTimeout(1000);
    const txt = await anon.textContent('body');
    check('promoted recipe renders publicly', txt.includes('Zupa Schrödingera') && txt.includes('Jan Kowalski'));
    check('promoted recipe has no email', !txt.includes('jan.kowalski@example.com'));
    await anon.close();
  }
  // regression: /recipes/new still renders the shared form for a logged-in author
  await page.goto(`${BASE}/recipes/new`);
  await page.waitForSelector('form', { timeout: 10000 }).catch(() => {});
  check('/recipes/new form renders', (await page.getByRole('button', { name: 'Opublikuj przepis' }).count()) === 1);
  check('/recipes/new has language picker', (await page.getByLabel('Język przepisu').count()) === 1);
  check('/recipes/new macros not optional label', !(await page.content()).includes('zostaw puste'));
  await ctx.close();
}
check('no page errors', errors.length === 0, errors.join('\n'));
await browser.close();
console.log(`\n${ok} passed, ${fail} failed`);
