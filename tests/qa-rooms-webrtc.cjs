const { chromium } = require('playwright');
const fs = require('fs');

const SITE_URL = process.env.SITE_URL || 'https://gcol.vercel.app/';
const USER_A = process.env.QA_USER_A || `QA_A_${Date.now()}`;
const USER_B = process.env.QA_USER_B || `QA_B_${Date.now()}`;
const ROOM_NAME = `QA-ROOM-${Date.now()}`;
const OUT = process.env.QA_OUTPUT || 'qa-results';

fs.mkdirSync(OUT, { recursive: true });
const results = [];

function record(name, status, details = {}) {
    results.push({ name, status, details, at: new Date().toISOString() });
    console.log(`[${status}] ${name}${Object.keys(details).length ? ` ${JSON.stringify(details)}` : ''}`);
}

function visible(el) {
    if (!el) return false;
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
}

async function waitVisible(page, selector, timeout = 15000) {
    await page.waitForFunction(sel => {
        const el = document.querySelector(sel);
        if (!el) return false;
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
    }, selector, { timeout });
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
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1000);

    // The current authentication UI exposes a required "Utilisateur" mode.
    // Keep the selector compatible with both the current and legacy username input IDs.
    const userMode = await visibleButtonContaining(page, 'Utilisateur');
    if (userMode) {
        await userMode.click();
        await page.waitForTimeout(300);
    }

    const usernameInput = page.locator('#userUsernameInput, #usernameInput').filter({ visible: true }).first();
    if (!(await usernameInput.count())) {
        throw new Error(`Champ utilisateur introuvable. Inputs visibles: ${JSON.stringify(await page.locator('input:visible').evaluateAll(els => els.map(el => ({ id: el.id, type: el.type, placeholder: el.placeholder })) ))}`);
    }

    await usernameInput.fill(username);

    const passwordInput = page.locator('#passwordInput').filter({ visible: true }).first();
    if (await passwordInput.count()) await passwordInput.fill('');

    const connectButton = await visibleButtonContaining(page, 'Se connecter');
    if (!connectButton) throw new Error('Bouton Se connecter introuvable');
    await connectButton.click();

    await page.waitForFunction(() => {
        const lobby = document.querySelector('#lobbyScreen');
        const auth = document.querySelector('#authScreen');
        const isVisible = el => {
            if (!el) return false;
            const s = getComputedStyle(el), r = el.getBoundingClientRect();
            return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
        };
        return isVisible(lobby) || !isVisible(auth);
    }, { timeout: 30000 });

    await waitVisible(page, '#lobbyScreen', 30000);
    await page.waitForFunction(() => !!window.currentUser, { timeout: 30000 });
}

async function waitForRoom(page, roomName) {
    await page.waitForFunction(name => {
        const text = document.querySelector('#roomList')?.innerText || '';
        return text.includes(name);
    }, roomName, { timeout: 20000 });
}

async function roomIdFor(page, roomName) {
    return page.evaluate(name => {
        const room = (window.rooms || []).find(r => r.name === name);
        return room?.id || null;
    }, roomName);
}

async function assertNoPageErrors(pageErrors, label) {
    record(label, pageErrors.length === 0 ? 'PASS' : 'FAIL', {
        count: pageErrors.length,
        errors: pageErrors.slice(0, 10)
    });
}

(async () => {
    const browser = await chromium.launch({
        headless: true,
        args: [
            '--use-fake-device-for-media-stream',
            '--use-fake-ui-for-media-stream',
            '--allow-http-screen-capture'
        ]
    });

    const contextA = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const contextB = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    const errorsA = [];
    const errorsB = [];
    pageA.on('pageerror', e => errorsA.push(e.message));
    pageB.on('pageerror', e => errorsB.push(e.message));

    try {
        console.log(`\n===== ROOMS + WEBRTC QA / ${USER_A} + ${USER_B} =====`);

        await login(pageA, USER_A);
        record('Rooms / A connecté', 'PASS', { username: USER_A });

        await login(pageB, USER_B);
        record('Rooms / B connecté', 'PASS', { username: USER_B });

        // Room creation through the real UI.
        await pageA.getByRole('button', { name: /Créer un salon/i }).click();
        const dialogInputs = pageA.locator('input:visible');
        let roomInput = null;
        for (let i = 0; i < await dialogInputs.count(); i++) {
            const input = dialogInputs.nth(i);
            const placeholder = (await input.getAttribute('placeholder')) || '';
            if (/salon|nom/i.test(placeholder)) {
                roomInput = input;
                break;
            }
        }

        if (roomInput) {
            await roomInput.fill(ROOM_NAME);
            const createButtons = pageA.locator('button:visible');
            let clicked = false;
            for (let i = 0; i < await createButtons.count(); i++) {
                const b = createButtons.nth(i);
                const text = ((await b.innerText().catch(() => '')) || '').trim();
                if (/créer|valider|confirmer/i.test(text)) {
                    await b.click();
                    clicked = true;
                    break;
                }
            }
            if (!clicked) throw new Error('Bouton de confirmation de création introuvable');
        } else {
            // Current/legacy fallback: exercise the real application function.
            await pageA.evaluate(name => window.createRoom?.(name), ROOM_NAME);
        }

        await waitForRoom(pageA, ROOM_NAME);
        await waitForRoom(pageB, ROOM_NAME);
        record('Rooms / création du salon', 'PASS', { room: ROOM_NAME });

        const roomId = await roomIdFor(pageA, ROOM_NAME);
        if (!roomId) throw new Error('ID du salon non trouvé après création');

        // Join through the actual room card/button when possible.
        const roomCard = pageA.locator('#roomList').getByText(ROOM_NAME, { exact: true }).first();
        await roomCard.waitFor({ state: 'visible', timeout: 15000 });
        const clickableCard = roomCard.locator('xpath=ancestor-or-self::*[self::button or @role="button"][1]');
        if (await clickableCard.count()) {
            await clickableCard.click();
        } else {
            await pageA.evaluate(id => window.joinRoom(id), roomId);
        }

        await pageA.waitForFunction(id => window.currentRoom?.id === id, roomId, { timeout: 20000 });
        await waitVisible(pageA, '#roomScreen', 10000);
        await pageA.waitForFunction(() => document.querySelectorAll('#videoGrid .video-card').length >= 1, { timeout: 10000 });
        record('Rooms / A rejoint le salon', 'PASS', {
            roomId,
            cards: await pageA.locator('#videoGrid .video-card').count()
        });

        const localMediaA = await pageA.evaluate(() => ({
            stream: !!window.localStream,
            audioTracks: window.localStream?.getAudioTracks().length || 0,
            videoTracks: window.localStream?.getVideoTracks().length || 0,
            audioEnabled: window.localStream?.getAudioTracks().every(t => t.enabled) || false,
            videoEnabled: window.localStream?.getVideoTracks().every(t => t.enabled) || false
        }));
        record('WebRTC / média local A', localMediaA.stream && localMediaA.audioTracks > 0 && localMediaA.videoTracks > 0 ? 'PASS' : 'FAIL', localMediaA);

        await pageA.locator('#desktopRoomChatButton').click().catch(async () => {
            await pageA.evaluate(() => window.toggleRoomChat?.());
        });
        await pageA.locator('#roomChatInput').fill('QA_ROOM_MESSAGE');
        await pageA.locator('.room-chat .chat-send').click();
        await pageA.waitForFunction(() => (document.querySelector('#roomChatMessages')?.innerText || '').includes('QA_ROOM_MESSAGE'), { timeout: 15000 });
        record('Rooms / chat du salon A', 'PASS');

        await waitForRoom(pageB, ROOM_NAME);
        await pageB.locator('#roomList').getByText(ROOM_NAME, { exact: true }).first().click().catch(async () => {
            await pageB.evaluate(id => window.joinRoom(id), roomId);
        });
        await pageB.waitForFunction(id => window.currentRoom?.id === id, roomId, { timeout: 20000 });
        await waitVisible(pageB, '#roomScreen', 10000);
        record('Rooms / B rejoint le salon', 'PASS', { roomId });

        await pageA.waitForFunction(username => {
            return [...document.querySelectorAll('#videoGrid .video-card')].some(card => (card.innerText || '').includes(username));
        }, USER_B, { timeout: 20000 });
        await pageB.waitForFunction(username => {
            return [...document.querySelectorAll('#videoGrid .video-card')].some(card => (card.innerText || '').includes(username));
        }, USER_A, { timeout: 20000 });

        const participantState = await pageA.evaluate(() => ({
            cards: document.querySelectorAll('#videoGrid .video-card').length,
            peers: window.peers?.size ?? 0,
            currentRoom: window.currentRoom?.id
        }));
        record('WebRTC / participants visibles', participantState.cards >= 2 ? 'PASS' : 'FAIL', participantState);

        await pageA.locator('#roomChatInput').fill('QA_ROOM_A_TO_B');
        await pageA.locator('.room-chat .chat-send').click();
        await pageB.waitForFunction(() => (document.querySelector('#roomChatMessages')?.innerText || '').includes('QA_ROOM_A_TO_B'), { timeout: 15000 });
        record('Rooms / chat A → B', 'PASS');

        const connectionResult = await Promise.race([
            pageA.waitForFunction(() => {
                for (const peer of (window.peers?.values?.() || [])) {
                    if (peer.connectionState === 'connected') return true;
                    if (peer.iceConnectionState === 'connected' || peer.iceConnectionState === 'completed') return true;
                }
                return false;
            }, { timeout: 20000 }).then(() => true),
            pageB.waitForFunction(() => {
                for (const peer of (window.peers?.values?.() || [])) {
                    if (peer.connectionState === 'connected') return true;
                    if (peer.iceConnectionState === 'connected' || peer.iceConnectionState === 'completed') return true;
                }
                return false;
            }, { timeout: 20000 }).then(() => true)
        ]).catch(() => false);

        const peerState = await pageA.evaluate(() => [...(window.peers?.entries?.() || [])].map(([id, peer]) => ({
            id,
            connectionState: peer.connectionState,
            iceConnectionState: peer.iceConnectionState,
            signalingState: peer.signalingState,
            localDescription: !!peer.localDescription,
            remoteDescription: !!peer.remoteDescription
        })));
        record('WebRTC / connexion peer-to-peer', connectionResult ? 'PASS' : 'FAIL', { peers: peerState });

        const remoteMedia = await pageA.waitForFunction(username => {
            const cards = [...document.querySelectorAll('#videoGrid .video-card')];
            const card = cards.find(c => (c.innerText || '').includes(username));
            const video = card?.querySelector('video');
            return !!(video?.srcObject && video.srcObject.getTracks().length);
        }, USER_B, { timeout: 20000 }).then(() => true).catch(() => false);
        const remoteDetails = await pageA.evaluate(username => {
            const card = [...document.querySelectorAll('#videoGrid .video-card')].find(c => (c.innerText || '').includes(username));
            const video = card?.querySelector('video');
            return {
                found: !!card,
                hasSrcObject: !!video?.srcObject,
                tracks: video?.srcObject?.getTracks().length || 0,
                readyState: video?.readyState ?? null
            };
        }, USER_B);
        record('WebRTC / flux distant reçu', remoteMedia ? 'PASS' : 'FAIL', remoteDetails);

        const beforeMedia = await pageA.evaluate(() => ({
            microphoneEnabled: window.microphoneEnabled,
            cameraEnabled: window.cameraEnabled
        }));
        await pageA.evaluate(() => window.toggleMicro());
        await pageA.waitForFunction(before => window.microphoneEnabled !== before, beforeMedia.microphoneEnabled, { timeout: 5000 });
        await pageA.evaluate(() => window.toggleCamera());
        await pageA.waitForFunction(before => window.cameraEnabled !== before, beforeMedia.cameraEnabled, { timeout: 5000 });
        const afterMedia = await pageA.evaluate(() => ({
            microphoneEnabled: window.microphoneEnabled,
            cameraEnabled: window.cameraEnabled,
            audioTrackEnabled: window.localStream?.getAudioTracks()[0]?.enabled ?? null,
            videoTrackEnabled: window.localStream?.getVideoTracks()[0]?.enabled ?? null
        }));
        record('WebRTC / contrôles micro-caméra',
            afterMedia.audioTrackEnabled === afterMedia.microphoneEnabled && afterMedia.videoTrackEnabled === afterMedia.cameraEnabled
                ? 'PASS' : 'FAIL',
            { before: beforeMedia, after: afterMedia });

        await pageA.locator('.leave-btn').click();
        await pageA.waitForFunction(() => !window.currentRoom && !window.localStream, { timeout: 10000 });
        await waitVisible(pageA, '#lobbyScreen', 10000);
        const cleanupState = await pageA.evaluate(() => ({
            currentRoom: window.currentRoom,
            peers: window.peers?.size ?? null,
            localStream: !!window.localStream
        }));
        record('Rooms / A quitte le salon + nettoyage', cleanupState.currentRoom == null && cleanupState.peers === 0 && !cleanupState.localStream ? 'PASS' : 'FAIL', cleanupState);

        await pageB.waitForFunction(username => {
            return ![...document.querySelectorAll('#videoGrid .video-card')].some(card => (card.innerText || '').includes(username));
        }, USER_A, { timeout: 15000 });
        record('Rooms / B voit le départ de A', 'PASS');

    } catch (error) {
        record('Rooms + WebRTC / runner', 'FAIL', { error: error.stack || error.message });
    } finally {
        await assertNoPageErrors(errorsA, 'Rooms + WebRTC / erreurs JavaScript A');
        await assertNoPageErrors(errorsB, 'Rooms + WebRTC / erreurs JavaScript B');
        await contextA.close();
        await contextB.close();
        await browser.close();
    }

    fs.writeFileSync(`${OUT}/report-rooms-webrtc.json`, JSON.stringify({
        site: SITE_URL,
        users: [USER_A, USER_B],
        room: ROOM_NAME,
        generatedAt: new Date().toISOString(),
        results
    }, null, 2));

    const failed = results.filter(r => r.status === 'FAIL');
    console.log(`\nRooms + WebRTC QA terminé : ${results.length} contrôles, ${failed.length} échec(s).`);
    process.exitCode = failed.length ? 1 : 0;
})();
