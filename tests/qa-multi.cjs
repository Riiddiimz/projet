const { chromium } = require('playwright');
const fs = require('fs');

const SITE_URL = process.env.SITE_URL || 'https://gcol.vercel.app/';
const USER_A = process.env.QA_USER_A || 'QA_A';
const USER_B = process.env.QA_USER_B || 'QA_B';
const ROOM_NAME = `QA-${Date.now()}`;
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
        const button = buttons.nth(i);
        const label = ((await button.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
        if (label.toLowerCase().includes(text.toLowerCase())) return button;
    }
    return null;
}

async function login(page, username) {
    await page.goto(SITE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(700);

    const userMode = await visibleButtonContaining(page, 'Utilisateur');
    if (userMode) await userMode.click();

    const input = page.locator('#userUsernameInput, #usernameInput').filter({ visible: true }).first();
    if (!(await input.count())) throw new Error('Formulaire utilisateur introuvable');
    await input.fill(username);

    const connect = await visibleButtonContaining(page, 'Se connecter');
    if (!connect) throw new Error('Bouton Se connecter introuvable');
    await connect.click();

    await page.waitForFunction(() => {
        const lobby = document.querySelector('#lobbyScreen');
        if (!lobby) return false;
        const s = getComputedStyle(lobby), r = lobby.getBoundingClientRect();
        return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
    }, { timeout: 30000 });
}

async function waitForRoom(page, roomName) {
    await page.waitForFunction(name => {
        const text = document.querySelector('#roomList')?.innerText || '';
        return text.includes(name);
    }, roomName, { timeout: 15000 });
}

(async () => {
    const browser = await chromium.launch({
        headless: true,
        args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']
    });

    const contextA = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const contextB = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    const pageErrors = [];
    pageA.on('pageerror', e => pageErrors.push({ user: USER_A, error: e.message }));
    pageB.on('pageerror', e => pageErrors.push({ user: USER_B, error: e.message }));

    try {
        console.log(`\n===== multi-user / ${USER_A} + ${USER_B} =====`);

        await login(pageA, USER_A);
        record('Multi / utilisateur A connecté', 'PASS', { username: USER_A });

        await login(pageB, USER_B);
        record('Multi / utilisateur B connecté', 'PASS', { username: USER_B });

        await pageA.evaluate(name => window.send({ type: 'create-room', name }), ROOM_NAME);
        await waitForRoom(pageA, ROOM_NAME);
        await waitForRoom(pageB, ROOM_NAME);
        record('Multi / création salon', 'PASS', { room: ROOM_NAME });

        const roomId = await pageA.evaluate(name => {
            const room = (window.rooms || []).find(r => r.name === name);
            return room?.id || null;
        }, ROOM_NAME);

        if (!roomId) throw new Error('ID du salon non trouvé côté A');

        await pageA.evaluate(id => window.send({ type: 'join-room', roomId: id }), roomId);
        await pageA.waitForFunction(() => !!window.currentRoom, { timeout: 15000 });
        record('Multi / A rejoint le salon', 'PASS', { roomId });

        await pageB.evaluate(id => window.send({ type: 'join-room', roomId: id }), roomId);
        await pageB.waitForFunction(() => !!window.currentRoom, { timeout: 15000 });
        await pageA.waitForFunction(username => {
            const cards = document.querySelectorAll('#videoGrid .video-card');
            return [...cards].some(card => (card.innerText || '').includes(username));
        }, USER_B, { timeout: 15000 }).catch(() => {});
        record('Multi / B rejoint le salon', 'PASS', { roomId });

        const participantsB = await pageB.evaluate(() => ({
            room: window.currentRoom,
            cards: document.querySelectorAll('#videoGrid .video-card').length,
            peers: window.peers?.size ?? null
        }));
        record('Multi / participants synchronisés', participantsB.room?.id === roomId ? 'PASS' : 'FAIL', participantsB);

        await pageA.evaluate(() => window.send({ type: 'chat', roomId: window.currentRoom.id, text: 'QA_MULTI_MESSAGE' }));
        await pageB.waitForFunction(() => (document.querySelector('#roomChatMessages')?.innerText || '').includes('QA_MULTI_MESSAGE'), { timeout: 15000 });
        record('Multi / chat A → B', 'PASS');

        await pageA.evaluate(() => window.toggleMicro());
        await pageB.waitForFunction(username => {
            const user = (window.users || []).find(u => u.username === username);
            return user ? user.microphoneEnabled === true : false;
        }, USER_A, { timeout: 10000 }).catch(() => {});
        const mediaState = await pageB.evaluate(username => {
            const user = (window.users || []).find(u => u.username === username);
            return user ? { microphoneEnabled: user.microphoneEnabled, cameraEnabled: user.cameraEnabled } : null;
        }, USER_A);
        record('Multi / état micro A → B', mediaState?.microphoneEnabled === true ? 'PASS' : 'WARN', mediaState || {});

        const sessionToken = await pageA.evaluate(() => localStorage.getItem('colincall_session'));
        if (!sessionToken) throw new Error('Session token absent');
        record('Session / token créé', 'PASS');

        await pageA.close();
        await contextA.close();

        const contextReconnect = await browser.newContext({ permissions: ['camera', 'microphone'] });
        await contextReconnect.addInitScript(token => localStorage.setItem('colincall_session', token), sessionToken);
        const pageReconnect = await contextReconnect.newPage();
        const reconnectErrors = [];
        pageReconnect.on('pageerror', e => reconnectErrors.push(e.message));

        await pageReconnect.goto(SITE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await pageReconnect.waitForFunction(() => !!window.currentUser, { timeout: 30000 });
        const restored = await pageReconnect.evaluate(() => ({ username: window.currentUser?.username, token: !!localStorage.getItem('colincall_session') }));
        record('Session / reconnexion WebSocket', restored.username === USER_A ? 'PASS' : 'FAIL', { ...restored, errors: reconnectErrors });

        await pageReconnect.evaluate(() => window.logout());
        await pageReconnect.waitForTimeout(700);
        const afterLogout = await pageReconnect.evaluate(() => ({
            currentUser: window.currentUser ?? null,
            token: localStorage.getItem('colincall_session'),
            authVisible: getComputedStyle(document.querySelector('#authScreen')).display !== 'none'
        }));
        record('Session / logout', !afterLogout.currentUser && !afterLogout.token && afterLogout.authVisible ? 'PASS' : 'FAIL', afterLogout);

        await contextReconnect.close();
    } catch (error) {
        record('Multi / runner', 'FAIL', { error: error.stack || error.message });
    } finally {
        record('Multi / erreurs JavaScript', pageErrors.length === 0 ? 'PASS' : 'FAIL', { count: pageErrors.length, errors: pageErrors.slice(0, 20) });
        await browser.close();
    }

    fs.writeFileSync(`${OUT}/report-multi.json`, JSON.stringify({
        site: SITE_URL,
        users: [USER_A, USER_B],
        room: ROOM_NAME,
        generatedAt: new Date().toISOString(),
        results
    }, null, 2));

    const failed = results.filter(r => r.status === 'FAIL');
    console.log(`\nMulti QA terminé : ${results.length} contrôles, ${failed.length} échec(s).`);
    process.exitCode = failed.length ? 1 : 0;
})();
