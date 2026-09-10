const { chromium } = require('playwright');
const fs = require('fs');

const SITE_URL = process.env.SITE_URL || 'http://127.0.0.1:3000';
const RUN_ID = `${Date.now()}-${process.pid}`;
const USER_A = `NEXT_A_${RUN_ID}`;
const USER_B = `NEXT_B_${RUN_ID}`;
const ROOM = `NEXT_ROOM_${RUN_ID}`;
const OUT = process.env.QA_OUTPUT || 'qa-results/nextjs';
fs.mkdirSync(OUT, { recursive: true });
const results = [];

function record(name, status, details = {}) {
  results.push({ name, status, details, at: new Date().toISOString() });
  console.log(`[${status}] ${name}${Object.keys(details).length ? ` ${JSON.stringify(details)}` : ''}`);
}

async function visible(page, selector) {
  const loc = page.locator(selector).first();
  if (!(await loc.count())) return false;
  return loc.evaluate(el => {
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
  }).catch(() => false);
}

async function login(page, username) {
  await page.goto(SITE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const input = page.locator('#userUsernameInput').first();
  await input.waitFor({ state: 'visible', timeout: 20000 });
  await input.fill(username);
  await page.getByRole('button', { name: /Se connecter/i }).click();
  await page.waitForFunction(() => document.body.innerText.includes('Salons') || document.body.innerText.includes('Créer un salon'), { timeout: 30000 });
}

async function createRoom(page) {
  const button = page.getByRole('button', { name: /Créer un salon/i }).first();

  await button.waitFor({ state: 'visible', timeout: 15000 });

  const dialogPromise = page.waitForEvent('dialog', { timeout: 10000 })
    .then(async dialog => {
      await dialog.accept(ROOM);
    });

  await button.click();
  await dialogPromise;

  await page.waitForFunction(
    name => document.body.innerText.includes(name),
    ROOM,
    { timeout: 15000 }
  );
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const contextA = await browser.newContext({ permissions: ['camera', 'microphone'], viewport: { width: 1440, height: 900 } });
  const contextB = await browser.newContext({ permissions: ['camera', 'microphone'], viewport: { width: 390, height: 844 } });
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  const errors = [];
  const failed = [];
  for (const [page, user] of [[pageA, USER_A], [pageB, USER_B]]) {
    page.on('pageerror', e => errors.push({ user, error: e.message }));
    page.on('requestfailed', r => failed.push({ user, url: r.url(), error: r.failure()?.errorText || 'unknown' }));
  }

  try {
    await login(pageA, USER_A);
    record('Next.js / A connexion', 'PASS', { username: USER_A });
    await login(pageB, USER_B);
    record('Next.js / B connexion mobile', 'PASS', { username: USER_B });

    record('Next.js / lobby A', await visible(pageA, 'main') ? 'PASS' : 'FAIL');
    record('Next.js / mobile viewport B', (pageB.viewportSize()?.width === 390) ? 'PASS' : 'FAIL');

    const inputs = await pageA.locator('input').evaluateAll(els => els.map(e => ({ id: e.id, placeholder: e.placeholder })));
    record('Next.js / champs lobby', inputs.length > 0 ? 'PASS' : 'FAIL', { inputs });

    await createRoom(pageA);
    record('Next.js / création salon', 'PASS', { room: ROOM });
    await pageB.waitForFunction(name => document.body.innerText.includes(name), ROOM, { timeout: 15000 });
    record('Next.js / salon synchronisé A → B', 'PASS');

    const roomCardA = pageA.locator('text=' + ROOM).first();
    await roomCardA.click({ timeout: 10000 });
    await pageA.waitForFunction(() => document.body.innerText.includes('Vous êtes connecté'), { timeout: 15000 });
    record('Next.js / entrée salon A', 'PASS');

    const videoGrid = pageA.locator('#videoGrid');
    await videoGrid.waitFor({ state: 'visible', timeout: 10000 });
    await pageA.waitForTimeout(1500);
    record('Next.js / grille vidéo', (await videoGrid.locator('video').count()) >= 1 ? 'PASS' : 'FAIL', { videos: await videoGrid.locator('video').count() });

    for (const selector of ['#microBtn', '#cameraBtn']) {
      record(`Next.js / contrôle ${selector}`, await visible(pageA, selector) ? 'PASS' : 'FAIL');
    }

    const chatButton = pageA.getByRole('button', { name: 'Chat' }).first();
    await chatButton.click();
    await pageA.waitForTimeout(300);
    record('Next.js / chat salon ouverture', (await pageA.locator('input, textarea').count()) > 0 ? 'PASS' : 'WARN');

    await pageA.screenshot({ path: `${OUT}/room-desktop.png`, fullPage: true });
    await pageB.screenshot({ path: `${OUT}/lobby-mobile.png`, fullPage: true });
  } catch (error) {
    record('Next.js / runner', 'FAIL', { error: error.stack || error.message });
  } finally {
    record('Next.js / erreurs JavaScript', errors.length === 0 ? 'PASS' : 'FAIL', { count: errors.length, errors: errors.slice(0, 20) });
    record('Next.js / requêtes échouées', failed.length === 0 ? 'PASS' : 'WARN', { count: failed.length, errors: failed.slice(0, 20) });
    fs.writeFileSync(`${OUT}/report.json`, JSON.stringify({ site: SITE_URL, users: [USER_A, USER_B], room: ROOM, generatedAt: new Date().toISOString(), results }, null, 2));
    await browser.close();
  }

  process.exitCode = results.some(r => r.status === 'FAIL') ? 1 : 0;
})();
