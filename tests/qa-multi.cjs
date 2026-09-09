const { chromium } = require('playwright');
const fs = require('fs');

const SITE_URL = process.env.SITE_URL || 'https://gcol.vercel.app/';
const USER_A = process.env.QA_USER_A || `QA_A_${Date.now()}`;
const USER_B = process.env.QA_USER_B || `QA_B_${Date.now()}`;
const PASSWORD = process.env.QA_PASSWORD || 'qa-test-password';
const ROOM_NAME = `QA-${Date.now()}`;
const OUT = process.env.QA_OUTPUT || 'qa-results';
fs.mkdirSync(OUT, { recursive: true });
const results = [];

function record(name, status, details = {}) {
  results.push({ name, status, details, at: new Date().toISOString() });
  console.log(`[${status}] ${name}${Object.keys(details).length ? ` ${JSON.stringify(details)}` : ''}`);
}

function visible(locator) {
  return locator.evaluate(el => {
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
  }).catch(() => false);
}

async function login(page, username) {
  await page.goto(SITE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const input = page.locator('#usernameInput, #userUsernameInput').first();
  await input.waitFor({ state: 'visible', timeout: 15000 });
  await input.fill(username);
  const password = page.locator('#passwordInput').first();
  if (await password.count() && await visible(password)) await password.fill(PASSWORD);
  await page.getByRole('button', { name: /Se connecter/i }).first().click();
  await page.locator('#lobbyScreen').waitFor({ state: 'visible', timeout: 30000 });
}

async function roomIdFromDom(page, name) {
  return page.locator('.room-card').filter({ hasText: name }).first().locator('button').first().evaluate(btn => {
    const match = String(btn.getAttribute('onclick') || '').match(/joinRoom\(['\"]([^'\"]+)/);
    return match ? match[1] : null;
  }).catch(() => null);
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const contextA = await browser.newContext({ permissions: ['camera', 'microphone'] });
  const contextB = await browser.newContext({ permissions: ['camera', 'microphone'] });
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  const pageErrors = [];
  const failedRequests = [];
  for (const [page, user] of [[pageA, USER_A], [pageB, USER_B]]) {
    page.on('pageerror', e => pageErrors.push({ user, error: e.message }));
    page.on('requestfailed', r => failedRequests.push({ user, url: r.url(), error: r.failure()?.errorText || 'unknown' }));
  }

  try {
    console.log(`\n===== multi-user / ${USER_A} + ${USER_B} =====`);
    await login(pageA, USER_A);
    record('Multi / A connecté', 'PASS', { username: USER_A });
    await login(pageB, USER_B);
    record('Multi / B connecté', 'PASS', { username: USER_B });

    await pageA.locator('#desktopGeneralChatButton:visible, #generalChatToggle:visible').first().click();
    await pageA.locator('#lobbyChatInput').fill('QA_GENERAL_MESSAGE');
    await pageA.locator('.chat-send').first().click();
    await pageB.locator('#lobbyChatMessages').waitFor({ state: 'attached', timeout: 10000 });
    await pageB.waitForFunction(() => (document.querySelector('#lobbyChatMessages')?.innerText || '').includes('QA_GENERAL_MESSAGE'), { timeout: 15000 });
    record('Chat général / A → B', 'PASS');

    await pageA.locator('.profile-top').click();
    await pageA.locator('#profileModal').waitFor({ state: 'visible', timeout: 5000 });
    const ownProfile = await pageA.locator('#profileUsername').innerText();
    record('Profil / ouverture', ownProfile === USER_A ? 'PASS' : 'FAIL', { displayedUsername: ownProfile });
    await pageA.locator('#profileDescriptionInput').fill('QA_PROFILE_DESCRIPTION');
    await pageA.getByRole('button', { name: 'Enregistrer' }).click();
    await pageA.waitForTimeout(500);
    record('Profil / modification locale', 'PASS', { description: 'QA_PROFILE_DESCRIPTION' });

    await pageB.waitForFunction(username => {
      return [...document.querySelectorAll('#onlineUsersList *')].some(el => (el.innerText || '').includes(username));
    }, USER_A, { timeout: 15000 });
    record('Présence / B voit A', 'PASS');

    await pageA.locator('#roomSearch').fill('zzzz-no-room');
    const emptySearch = await pageA.locator('#roomList').innerText();
    record('Recherche salons / filtre', emptySearch.includes(ROOM_NAME) ? 'FAIL' : 'PASS', { query: 'zzzz-no-room' });
    await pageA.locator('#roomSearch').fill('');

    const createButton = pageA.getByRole('button', { name: /Créer un salon/i }).first();
    const dialogPromise = pageA.waitForEvent('dialog');
    await createButton.click();
    const dialog = await dialogPromise;
    await dialog.accept(ROOM_NAME);
    await pageA.locator('.room-card').filter({ hasText: ROOM_NAME }).waitFor({ state: 'visible', timeout: 15000 });
    await pageB.locator('.room-card').filter({ hasText: ROOM_NAME }).waitFor({ state: 'visible', timeout: 15000 });
    record('Salons / création synchronisée A → B', 'PASS', { room: ROOM_NAME });

    const roomId = await roomIdFromDom(pageA, ROOM_NAME);
    if (!roomId) throw new Error('ID du salon introuvable dans le DOM');
    await pageA.locator('.room-card').filter({ hasText: ROOM_NAME }).locator('.join-room-btn').click();
    await pageA.locator('#roomScreen').waitFor({ state: 'visible', timeout: 15000 });
    record('Salons / A rejoint', 'PASS', { roomId });
    await pageA.locator('.back-btn').click();
    await pageA.locator('#lobbyScreen').waitFor({ state: 'visible', timeout: 15000 });
    record('Navigation / A salon → lobby', 'PASS');

    const token = await pageA.evaluate(() => localStorage.getItem('colincall_session'));
    record('Session / token présent', token ? 'PASS' : 'FAIL', { present: !!token });

    await pageA.evaluate(() => window.logout());
    await pageA.locator('#authScreen').waitFor({ state: 'visible', timeout: 10000 });
    const loggedOut = await pageA.evaluate(() => ({ token: localStorage.getItem('colincall_session'), auth: getComputedStyle(document.querySelector('#authScreen')).display !== 'none' }));
    record('Session / logout', !loggedOut.token && loggedOut.auth ? 'PASS' : 'FAIL', loggedOut);
  } catch (error) {
    record('Multi / runner', 'FAIL', { error: error.stack || error.message });
  } finally {
    record('Multi / erreurs JavaScript', pageErrors.length === 0 ? 'PASS' : 'FAIL', { count: pageErrors.length, errors: pageErrors.slice(0, 20) });
    record('Multi / requêtes échouées', failedRequests.length === 0 ? 'PASS' : 'WARN', { count: failedRequests.length, errors: failedRequests.slice(0, 20) });
    await browser.close();
    fs.writeFileSync(`${OUT}/report-multi.json`, JSON.stringify({ site: SITE_URL, users: [USER_A, USER_B], room: ROOM_NAME, generatedAt: new Date().toISOString(), results }, null, 2));
  }
  const failed = results.filter(r => r.status === 'FAIL');
  console.log(`\nMulti QA terminé : ${results.length} contrôles, ${failed.length} échec(s).`);
  process.exitCode = failed.length ? 1 : 0;
})();
