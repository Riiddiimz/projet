import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = (process.env.SITE_URL || 'https://gcol.vercel.app').replace(/\/$/, '');
const WS_URL = process.env.SIGNALING_URL || 'wss://projet-nz7b.onrender.com';
const out = 'artifacts/site-guardian';
fs.mkdirSync(out, { recursive: true });

const failures = [];
const checks = [];
const pass = (name, detail = '') => { checks.push({ ok: true, name, detail }); console.log(`[PASS] ${name}${detail ? ` — ${detail}` : ''}`); };
const fail = (name, detail) => { failures.push({ name, detail }); checks.push({ ok: false, name, detail }); console.error(`[FAIL] ${name} — ${detail}`); };

async function waitForProduction(url) {
  for (let i = 0; i < 12; i++) {
    try {
      const r = await fetch(url, { redirect: 'follow' });
      if (r.ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error(`Production not reachable: ${url}`);
}

function isGreen(css) {
  const m = css.match(/rgba?\(([^)]+)\)/i);
  if (!m) return false;
  const [r,g,b] = m[1].split(',').map(x => Number.parseFloat(x.trim()));
  return Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b) && g > r * 1.35 && g > b * 1.25;
}

await waitForProduction(`${BASE}/health`);
pass('Production reachable');

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const consoleErrors = [];
const pageErrors = [];
const requestErrors = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', e => pageErrors.push(String(e)));
page.on('requestfailed', r => requestErrors.push(`${r.method()} ${r.url()} — ${r.failure()?.errorText || 'failed'}`));

const routes = ['/', '/privacy', '/health', '/manifest.webmanifest', '/robots.txt', '/sitemap.xml', '/this-page-must-not-exist'];
for (const route of routes) {
  const expected404 = route === '/this-page-must-not-exist';
  const p = await context.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(String(e)));
  try {
    const response = await p.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const status = response?.status() ?? 0;
    if (expected404 ? status !== 404 : status < 200 || status >= 400) fail(`Route ${route}`, `HTTP ${status}`);
    else pass(`Route ${route}`, `HTTP ${status}`);
    if (errors.length) fail(`JS ${route}`, errors.join(' | '));
    else pass(`JS ${route}`);
  } catch (e) {
    fail(`Route ${route}`, e.message);
  } finally {
    await p.close();
  }
}

await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 30000 });
await page.screenshot({ path: `${out}/login.png`, fullPage: true });

const selectors = [
  ['login page', '.login-page'],
  ['login card', '.login-card'],
  ['login logo', '.login-logo'],
  ['username input', '#userUsernameInput'],
  ['password input', '#passwordInput'],
  ['login button', '#userLoginButton'],
  ['user selector', '.login-user-choice'],
];
for (const [name, selector] of selectors) {
  if (await page.locator(selector).count()) pass(`Login ${name}`);
  else fail(`Login ${name}`, `missing ${selector}`);
}

const logo = page.locator('.login-logo');
if (await logo.count()) {
  const box = await logo.boundingBox();
  const src = await logo.getAttribute('src');
  if (src?.includes('clogo-galaxy.svg') && box && box.width <= 280) pass('Login logo visual', `${src}, ${Math.round(box.width)}px`);
  else fail('Login logo visual', `src=${src}, width=${box?.width}`);
}

const userButton = page.locator('.login-user-choice');
if (await userButton.count()) {
  const text = await userButton.evaluate(el => getComputedStyle(el, '::after').content);
  const bg = await userButton.evaluate(el => getComputedStyle(el).backgroundColor + ' ' + getComputedStyle(el).backgroundImage);
  if (text.includes('Utilisateur')) pass('Login user text', text);
  else fail('Login user text', `pseudo content=${text}`);
  if (!isGreen(bg)) pass('Login user button palette', bg);
  else fail('Login user button palette', `green background detected: ${bg}`);
}

const nebula = await page.locator('.login-page').evaluate(el => {
  const s = getComputedStyle(el, '::before');
  return { position: s.position, zIndex: s.zIndex, bg: s.backgroundImage, opacity: s.opacity };
});
if (nebula.position === 'fixed' && nebula.bg !== 'none') pass('Login nebula layer', JSON.stringify(nebula));
else fail('Login nebula layer', JSON.stringify(nebula));

const wsProbe = await page.evaluate(async (url) => await new Promise(resolve => {
  let done = false;
  const finish = value => { if (!done) { done = true; resolve(value); } };
  try {
    const ws = new WebSocket(url);
    ws.onopen = () => { ws.close(); finish('open'); };
    ws.onerror = () => finish('error');
    setTimeout(() => finish('timeout'), 10000);
  } catch { finish('exception'); }
}), WS_URL);
if (wsProbe === 'open') pass('Signaling WebSocket reachable', WS_URL);
else fail('Signaling WebSocket reachable', `${WS_URL}: ${wsProbe}`);

const username = `GUARDIAN_${Date.now()}`;
await page.locator('#userUsernameInput').fill(username);
await page.locator('#userLoginButton').click();
try {
  await page.locator('#userUsernameInput').waitFor({ state: 'detached', timeout: 15000 });
  pass('Authentication flow', username);
} catch {
  const error = await page.locator('#userLoginError').textContent().catch(() => null);
  fail('Authentication flow', error || 'login form remained visible');
}

if (!await page.locator('#userUsernameInput').count()) {
  await page.waitForTimeout(1500);
  const bodyText = await page.locator('body').innerText();
  if (bodyText.length > 50) pass('Lobby rendered', `${bodyText.length} chars`);
  else fail('Lobby rendered', 'empty/near-empty page');

  const interactive = await page.locator('button').count();
  if (interactive >= 3) pass('Lobby controls', `${interactive} buttons`);
  else fail('Lobby controls', `${interactive} buttons found`);
}

await page.screenshot({ path: `${out}/after-login.png`, fullPage: true });

if (consoleErrors.length) fail('Console errors', consoleErrors.slice(0, 10).join(' | '));
else pass('Console errors');
if (pageErrors.length) fail('Page errors', pageErrors.slice(0, 10).join(' | '));
else pass('Page errors');
if (requestErrors.length) fail('Failed requests', requestErrors.slice(0, 10).join(' | '));
else pass('Failed requests');

await browser.close();
fs.writeFileSync(`${out}/report.json`, JSON.stringify({ base: BASE, ws: WS_URL, checks, failures }, null, 2));

console.log(`\n===== SITE GUARDIAN: ${failures.length ? 'FAILED' : 'GREEN'} =====`);
console.log(`Checks: ${checks.length} | Failures: ${failures.length}`);
if (failures.length) process.exit(1);
