const { chromium, devices } = require('playwright');
const fs = require('fs');

const SITE_URL = process.env.SITE_URL || 'https://gcol.vercel.app/';
const TEST_USERNAME = process.env.TEST_USERNAME || 'TEST';
const OUT = process.env.QA_OUTPUT || 'qa-results';
fs.mkdirSync(OUT, { recursive: true });
const results = [];

function record(name, status, details = {}) {
  results.push({ name, status, details, at: new Date().toISOString() });
  console.log(`[${status}] ${name}${Object.keys(details).length ? ` ${JSON.stringify(details)}` : ''}`);
}

async function inspectElement(page, selector) {
  const loc = page.locator(selector).first();
  if (!(await loc.count())) return { exists: false };
  return loc.evaluate(el => {
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    return {
      exists: true,
      visible: !!(r.width && r.height && s.display !== 'none' && s.visibility !== 'hidden'),
      rect: { x: r.x, y: r.y, width: r.width, height: r.height },
      display: s.display, visibility: s.visibility, opacity: s.opacity,
      pointerEvents: s.pointerEvents, transform: s.transform, zIndex: s.zIndex,
      disabled: !!el.disabled,
      text: (el.innerText || el.textContent || '').trim().slice(0, 300)
    };
  });
}

async function sidebarState(page) {
  return page.locator('#lobbyScreen .users-sidebar').first().evaluate(el => {
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    return {
      exists: true,
      visible: s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0,
      display: s.display, visibility: s.visibility, opacity: s.opacity,
      transform: s.transform, className: el.className,
      ariaHidden: el.getAttribute('aria-hidden'), dataState: el.getAttribute('data-state'),
      width: r.width, height: r.height
    };
  }).catch(() => ({ exists: false }));
}

async function visibleButtonContaining(page, text) {
  const buttons = page.locator('button:visible');
  for (let i = 0; i < await buttons.count(); i++) {
    const button = buttons.nth(i);
    const label = ((await button.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    if (label.toLowerCase().includes(text.toLowerCase())) return button;
  }
  return null;
}

async function snapshot(page, label) {
  const data = {
    url: page.url(), title: await page.title().catch(() => ''), viewport: page.viewportSize(),
    readyState: await page.evaluate(() => document.readyState).catch(() => ''),
    bodyText: await page.locator('body').innerText().catch(() => ''),
    authScreen: await inspectElement(page, '#authScreen'),
    app: await inspectElement(page, '#app'),
    lobby: await inspectElement(page, '#lobbyScreen'),
    usernameInput: await inspectElement(page, '#userUsernameInput, #usernameInput'),
    passwordInput: await inspectElement(page, '#passwordInput'),
    usersButton: await inspectElement(page, '#usersSidebarToggle'),
    usersSidebar: await inspectElement(page, '#lobbyScreen .users-sidebar'),
    generalChatButton: await inspectElement(page, '#generalChatToggle'),
    roomList: await inspectElement(page, '#roomList'),
    roomScreen: await inspectElement(page, '#roomScreen')
  };
  fs.writeFileSync(`${OUT}/${label}.json`, JSON.stringify(data, null, 2));
  return data;
}

async function login(page, diagnostics) {
  try {
    await page.goto(SITE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1000);
  } catch (error) {
    record('Login flow', 'FAIL', { reason: 'page.goto failed', error: error.message });
    return false;
  }

  await snapshot(page, '00-login-page');

  const userButton = await visibleButtonContaining(page, 'Utilisateur');
  if (!userButton) {
    record('Auth / bouton Utilisateur', 'FAIL', {
      reason: 'visible button containing "Utilisateur" missing',
      visibleButtons: await page.locator('button:visible').allTextContents().catch(() => [])
    });
    return false;
  }
  await userButton.click();
  await page.waitForTimeout(500);
  record('Auth / bouton Utilisateur', 'PASS', { clickedText: ((await userButton.innerText().catch(() => '')) || '').trim() });

  const username = page.locator('#userUsernameInput, #usernameInput').filter({ visible: true }).first();
  if (!(await username.count())) {
    record('Auth / formulaire utilisateur', 'FAIL', {
      reason: 'username input not visible',
      visibleInputs: await page.locator('input:visible').evaluateAll(els => els.map(el => ({ id: el.id, type: el.type, placeholder: el.placeholder }))).catch(() => [])
    });
    return false;
  }

  await username.fill(TEST_USERNAME);
  record('Auth / pseudo TEST', 'PASS', { username: TEST_USERNAME, inputId: await username.getAttribute('id') });

  const connectButton = await visibleButtonContaining(page, 'Se connecter');
  if (!connectButton) {
    record('Auth / bouton Se connecter', 'FAIL', { reason: 'button missing' });
    return false;
  }
  await connectButton.click();
  record('Auth / bouton Se connecter', 'PASS', { clickedText: ((await connectButton.innerText().catch(() => '')) || '').trim() });

  try {
    await page.waitForFunction(() => {
      const lobby = document.querySelector('#lobbyScreen');
      const auth = document.querySelector('#authScreen');
      const visible = el => {
        if (!el) return false;
        const s = getComputedStyle(el), r = el.getBoundingClientRect();
        return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
      };
      return visible(lobby) || !visible(auth);
    }, { timeout: 30000 });
  } catch (error) {
    const input = page.locator('#userUsernameInput, #usernameInput').first();
    const state = await page.evaluate(() => ({
      socketState: window.socket?.readyState ?? null,
      socketStateName: ['CONNECTING','OPEN','CLOSING','CLOSED'][window.socket?.readyState] || null,
      hasSocket: !!window.socket,
      currentUser: window.currentUser ?? null,
      sessionToken: !!window.sessionToken
    })).catch(() => ({}));
    const details = {
      username: TEST_USERNAME,
      error: error.message,
      socket: state,
      authScreen: await inspectElement(page, '#authScreen'),
      app: await inspectElement(page, '#app'),
      lobby: await inspectElement(page, '#lobbyScreen'),
      loginError: ((await page.locator('#loginError').textContent().catch(() => '')) || '').trim(),
      visibleButtons: await page.locator('button:visible').allTextContents().catch(() => []),
      visibleInputs: await page.locator('input:visible').evaluateAll(els => els.map(el => ({ id: el.id, type: el.type, value: el.value }))).catch(() => []),
      inputId: await input.getAttribute('id').catch(() => null)
    };
    diagnostics.authFailure = details;
    await snapshot(page, '03-login-transition-failed');
    await page.screenshot({ path: `${OUT}/03-login-transition-failed.png`, fullPage: true }).catch(() => {});
    record('Authentication / arrivée menu salons', 'FAIL', details);
    return false;
  }

  await page.waitForTimeout(1500);
  const lobby = await inspectElement(page, '#lobbyScreen');
  const roomList = await inspectElement(page, '#roomList');
  if (!lobby.visible) {
    record('Authentication / arrivée menu salons', 'FAIL', {
      reason: 'lobby not visible after authentication', lobby,
      authScreen: await inspectElement(page, '#authScreen'), app: await inspectElement(page, '#app'), roomList,
      loginError: ((await page.locator('#loginError').textContent().catch(() => '')) || '').trim()
    });
    return false;
  }
  record('Authentication / arrivée menu salons', 'PASS', { lobby, roomList, username: TEST_USERNAME });
  await page.screenshot({ path: `${OUT}/03-lobby-after-login.png`, fullPage: true });
  return true;
}

async function testUsersSidebar(page) {
  const button = page.locator('#usersSidebarToggle').first();
  const sidebar = page.locator('#lobbyScreen .users-sidebar').first();
  if (!(await button.count()) || !(await sidebar.count())) {
    record('Lobby / Utilisateurs', 'FAIL', { reason: 'button or sidebar missing' });
    return;
  }

  const mobile = (page.viewportSize()?.width || 9999) <= 700;
  const before = await sidebarState(page);
  const buttonBefore = await inspectElement(page, '#usersSidebarToggle');

  if (!mobile) {
    record('Lobby / Utilisateurs', 'PASS', {
      mode: 'desktop', expectedBehavior: 'sidebar permanently visible',
      sidebar: before, button: buttonBefore
    });
    return;
  }

  await button.click({ force: true });
  await page.waitForTimeout(500);
  const after = await sidebarState(page);
  const buttonAfter = await inspectElement(page, '#usersSidebarToggle');
  const hidden = !after.visible || after.opacity === '0' || after.pointerEvents === 'none' || /-1|matrix\(1, 0, 0, 1, -/.test(after.transform || '');
  record('Lobby / Utilisateurs', hidden ? 'PASS' : 'FAIL', { mode: 'mobile', before, after, buttonBefore, buttonAfter });

  await button.click({ force: true });
  await page.waitForTimeout(500);
  const returned = await sidebarState(page);
  const reopened = returned.visible && returned.opacity !== '0' && returned.pointerEvents !== 'none';
  record('Lobby / Utilisateurs / toggle retour', reopened ? 'PASS' : 'FAIL', { after, returned });
}

async function testLobby(page) {
  for (const [name, selector] of [
    ['Lobby / recherche salons', '#roomSearch'],
    ['Lobby / liste salons', '#roomList'],
    ['Lobby / chat général', '#generalChatToggle'],
    ['Lobby / profil', '.profile-top']
  ]) {
    const info = await inspectElement(page, selector);
    record(name, info.exists && info.visible ? 'PASS' : 'WARN', info);
  }
  const search = page.locator('#roomSearch');
  if (await search.count()) {
    await search.fill('TEST');
    await page.waitForTimeout(300);
    record('Lobby / recherche TEST', 'PASS', { value: await search.inputValue() });
    await search.fill('');
  }
}

async function testButtons(page) {
  for (const selector of ['#generalChatToggle', '#desktopGeneralChatButton', '#desktopRoomChatButton', '#roomChatMobileButton', '#usersSidebarToggle', '.profile-top', '#adminButton']) {
    const info = await inspectElement(page, selector);
    if (!info.exists) continue;
    record(`UI / ${selector}`, info.visible && info.pointerEvents !== 'none' ? 'PASS' : 'WARN', info);
  }
}

async function runDevice(name, device) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ...device, permissions: ['camera', 'microphone'], ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const consoleErrors = [], pageErrors = [], failedRequests = [], wsEvents = [], diagnostics = {};

  page.on('console', msg => { if (msg.type() === 'error' || msg.type() === 'warning') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => pageErrors.push(err.message));
  page.on('requestfailed', req => failedRequests.push({ url: req.url(), error: req.failure()?.errorText || 'unknown' }));
  page.on('websocket', ws => {
    wsEvents.push({ event: 'created', url: ws.url() });
    ws.on('close', () => wsEvents.push({ event: 'closed', url: ws.url() }));
  });

  console.log(`\n===== ${name} =====`);
  const authenticated = await login(page, diagnostics);
  if (authenticated) {
    await testLobby(page);
    await testUsersSidebar(page);
    await testButtons(page);
    await snapshot(page, `06-final-${name}`);
  }

  fs.writeFileSync(`${OUT}/diagnostics-${name}.json`, JSON.stringify({ consoleErrors, pageErrors, failedRequests, wsEvents, diagnostics }, null, 2));
  record(`${name} / erreurs JS`, pageErrors.length === 0 ? 'PASS' : 'FAIL', { count: pageErrors.length, errors: pageErrors.slice(0, 20) });
  record(`${name} / console`, consoleErrors.length === 0 ? 'PASS' : 'WARN', { count: consoleErrors.length, errors: consoleErrors.slice(0, 20) });
  record(`${name} / réseau`, failedRequests.length === 0 ? 'PASS' : 'WARN', { count: failedRequests.length, errors: failedRequests.slice(0, 20) });
  await browser.close();
}

(async () => {
  try {
    await runDevice('desktop', { viewport: { width: 1440, height: 900 } });
    await runDevice('iphone13', devices['iPhone 13']);
  } catch (error) {
    record('QA runner', 'FAIL', { error: error.stack || error.message });
  }
  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify({ site: SITE_URL, username: TEST_USERNAME, generatedAt: new Date().toISOString(), results }, null, 2));
  const failed = results.filter(r => r.status === 'FAIL');
  console.log(`\nQA terminé : ${results.length} contrôles, ${failed.length} échec(s).`);
  process.exitCode = failed.length ? 1 : 0;
})();