const { chromium } = require('playwright');
const fs = require('fs');

const SITE_URL = process.env.SITE_URL || 'https://gcol.vercel.app/';
const PASSWORD = process.env.QA_PASSWORD || 'qa-test-password';
const USERS = [
  process.env.QA_USER_A || `QA_A_${Date.now()}`,
  process.env.QA_USER_B || `QA_B_${Date.now()}`,
  process.env.QA_USER_C || `QA_C_${Date.now()}`
];
const ROOM_NAME = `QA-ROBUST-${Date.now()}`;
const OUT = process.env.QA_OUTPUT || 'qa-results';
fs.mkdirSync(OUT, { recursive: true });
const results = [];

function record(name, status, details = {}) {
  results.push({ name, status, details, at: new Date().toISOString() });
  console.log(`[${status}] ${name}${Object.keys(details).length ? ` ${JSON.stringify(details)}` : ''}`);
}

async function visibleButtonContaining(page, text) {
  const buttons = page.locator('button:visible');
  for (let i = 0; i < await buttons.count(); i++) {
    const b = buttons.nth(i);
    const label = ((await b.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    if (label.toLowerCase().includes(text.toLowerCase())) return b;
  }
  return null;
}

async function waitVisible(page, selector, timeout = 15000) {
  await page.waitForFunction(sel => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
  }, selector, { timeout });
}

async function login(page, username) {
  await page.goto(SITE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(700);
  const mode = await visibleButtonContaining(page, 'Utilisateur');
  if (mode) { await mode.click(); await page.waitForTimeout(200); }
  const input = page.locator('#userUsernameInput, #usernameInput').first();
  await input.waitFor({ state: 'visible', timeout: 15000 });
  await input.fill(username);
  const password = page.locator('#passwordInput').first();
  if (await password.isVisible().catch(() => false)) await password.fill(PASSWORD);
  const connect = await visibleButtonContaining(page, 'Se connecter');
  if (!connect) throw new Error('Bouton Se connecter introuvable');
  await connect.click();
  await waitVisible(page, '#lobbyScreen', 30000);
}

async function createRoom(page) {
  const button = await visibleButtonContaining(page, 'Créer un salon');
  if (!button) throw new Error('Bouton Créer un salon introuvable');
  const dialogPromise = page.waitForEvent('dialog');
  await button.click();
  const dialog = await dialogPromise;
  await dialog.accept(ROOM_NAME);
  await page.waitForFunction(name => (document.querySelector('#roomList')?.innerText || '').includes(name), ROOM_NAME, { timeout: 20000 });
}

async function joinRoom(page) {
  const card = page.locator('#roomList .room-card').filter({ hasText: ROOM_NAME }).first();
  await card.waitFor({ state: 'visible', timeout: 20000 });
  await card.locator('.join-room-btn').click();
  await waitVisible(page, '#roomScreen', 20000);
}

async function roomState(page) {
  return page.evaluate(() => {
    const cards = [...document.querySelectorAll('#videoGrid .video-card')];
    return {
      roomVisible: (() => { const e = document.querySelector('#roomScreen'); if (!e) return false; const s = getComputedStyle(e), r = e.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0; })(),
      cards: cards.length,
      names: cards.map(c => (c.innerText || '').replace(/\s+/g, ' ').trim()),
      activeTracks: cards.flatMap(c => [...c.querySelectorAll('video')].flatMap(v => v.srcObject?.getTracks() || [])).filter(t => t.readyState !== 'ended').length
    };
  });
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']
  });
  const contexts = await Promise.all(USERS.map(() => browser.newContext({ permissions: ['camera', 'microphone'] })));
  const pages = await Promise.all(contexts.map(c => c.newPage()));
  const errors = [];
  pages.forEach((p, i) => p.on('pageerror', e => errors.push({ user: USERS[i], error: e.message })));

  try {
    console.log(`\n===== ROBUSTNESS QA / ${USERS.join(' + ')} =====`);

    for (let i = 0; i < pages.length; i++) {
      await login(pages[i], USERS[i]);
      record(`Robustness / ${USERS[i]} connecté`, 'PASS');
    }

    await createRoom(pages[0]);
    for (const page of pages.slice(1)) {
      await page.waitForFunction(name => (document.querySelector('#roomList')?.innerText || '').includes(name), ROOM_NAME, { timeout: 20000 });
    }
    record('Robustness / salon synchronisé sur 3 clients', 'PASS', { room: ROOM_NAME });

    for (const page of pages) await joinRoom(page);
    for (let i = 0; i < pages.length; i++) {
      await pages[i].waitForFunction(() => document.querySelectorAll('#videoGrid .video-card').length >= 3, { timeout: 30000 });
    }
    const states3 = await Promise.all(pages.map(roomState));
    record('Robustness / 3 utilisateurs présents', states3.every(s => s.cards >= 3) ? 'PASS' : 'FAIL', { states: states3 });

    await pages[0].locator('#roomChatInput').fill('QA_THREE_USERS');
    await pages[0].locator('.room-chat .chat-send').click();
    for (const page of pages.slice(1)) {
      await page.waitForFunction(() => (document.querySelector('#roomChatMessages')?.innerText || '').includes('QA_THREE_USERS'), { timeout: 15000 });
    }
    record('Robustness / chat A → B + C', 'PASS');

    await pages[1].reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitVisible(pages[1], '#lobbyScreen', 30000);
    await pages[1].waitForFunction(name => (document.querySelector('#roomList')?.innerText || '').includes(name), ROOM_NAME, { timeout: 20000 });
    record('Robustness / refresh B → lobby', 'PASS');
    await joinRoom(pages[1]);
    await pages[1].waitForFunction(() => document.querySelectorAll('#videoGrid .video-card').length >= 3, { timeout: 30000 });
    record('Robustness / B rejoint après refresh', 'PASS', await roomState(pages[1]));

    await pages[2].close();
    await pages[0].waitForFunction(username => ![...document.querySelectorAll('#videoGrid .video-card')].some(c => (c.innerText || '').includes(username)), USERS[2], { timeout: 20000 });
    await pages[1].waitForFunction(username => ![...document.querySelectorAll('#videoGrid .video-card')].some(c => (c.innerText || '').includes(username)), USERS[2], { timeout: 20000 });
    record('Robustness / départ brutal C propagé', 'PASS');

    await pages[0].locator('.leave-btn').click();
    await waitVisible(pages[0], '#lobbyScreen', 10000);
    await pages[1].waitForFunction(username => ![...document.querySelectorAll('#videoGrid .video-card')].some(c => (c.innerText || '').includes(username)), USERS[0], { timeout: 15000 });
    record('Robustness / départ normal A propagé', 'PASS');

    await joinRoom(pages[0]);
    await pages[0].waitForFunction(() => document.querySelectorAll('#videoGrid .video-card').length >= 2, { timeout: 30000 });
    record('Robustness / A rejoint à nouveau', 'PASS', await roomState(pages[0]));

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, permissions: ['camera', 'microphone'] });
    const mobileErrors = [];
    mobile.on('pageerror', e => mobileErrors.push(e.message));
    await login(mobile, `QA_MOBILE_${Date.now()}`);
    await mobile.waitForFunction(name => (document.querySelector('#roomList')?.innerText || '').includes(name), ROOM_NAME, { timeout: 20000 });
    await joinRoom(mobile);
    await waitVisible(mobile, '#roomScreen', 15000);
    const mobileState = await roomState(mobile);
    record('Robustness / viewport mobile', mobileState.roomVisible && mobileState.cards >= 3 ? 'PASS' : 'FAIL', { viewport: [390, 844], state: mobileState, errors: mobileErrors });
    await mobile.close();

    await pages[0].locator('.leave-btn').click().catch(() => {});
    await pages[1].locator('.leave-btn').click().catch(() => {});

  } catch (error) {
    record('Robustness / runner', 'FAIL', { error: error.stack || error.message });
  } finally {
    record('Robustness / erreurs JavaScript', errors.length === 0 ? 'PASS' : 'FAIL', { count: errors.length, errors: errors.slice(0, 20) });
    await browser.close();
    fs.writeFileSync(`${OUT}/report-robustness.json`, JSON.stringify({ site: SITE_URL, users: USERS, room: ROOM_NAME, generatedAt: new Date().toISOString(), results }, null, 2));
  }

  const failed = results.filter(r => r.status === 'FAIL');
  console.log(`\nRobustness QA terminé : ${results.length} contrôles, ${failed.length} échec(s).`);
  process.exitCode = failed.length ? 1 : 0;
})();
