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

async function waitVisible(page, selector, timeout = 15000) {
    await page.waitForFunction(sel => {
        const el = document.querySelector(sel);
        if (!el) return false;
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
    }, selector, { timeout });
}

async function login(page, username) {
    await page.goto(SITE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(500);

    await page.locator('#usernameInput').fill(username);
    await page.locator('#passwordInput').fill('');
    await page.getByRole('button', { name: 'Se connecter' }).click();
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

        // 1. Authentication
        await login(pageA, USER_A);
        record('Rooms / A connecté', 'PASS', { username: USER_A });

        await login(pageB, USER_B);
        record('Rooms / B connecté', 'PASS', { username: USER_B });

        // 2. Room creation through the real UI
        await pageA.getByRole('button', { name: /Créer un salon/i }).click();
        const roomInput = pageA.locator('input').filter({ has: undefined });
        const dialogInputs = pageA.locator('input:visible');
        const visibleInputs = [];
        for (let i = 0; i < await dialogInputs.count(); i++) {
            const input = dialogInputs.nth(i);
            const placeholder = (await input.getAttribute('placeholder')) || '';
            const value = (await input.inputValue().catch(() => '')) || '';
            if (/salon|nom/i.test(placeholder) || /salon|nom/i.test(value)) visibleInputs.push(input);
        }

        if (visibleInputs.length) {
            await visibleInputs[0].fill(ROOM_NAME);
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
            // Fallback only if the UI implementation has no visible creation field.
            await pageA.evaluate(name => window.createRoom?.(name), ROOM_NAME);
        }

        await waitForRoom(pageA, ROOM_NAME);
        await waitForRoom(pageB, ROOM_NAME);
        record('Rooms / création du salon', 'PASS', { room: ROOM_NAME });

        const roomId = await roomIdFor(pageA, ROOM_NAME);
        if (!roomId) throw new Error('ID du salon non trouvé après création');

        // 3. Join through the actual room card/button when possible.
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

        // Verify local media really exists, not just the UI state.
        const localMediaA = await pageA.evaluate(() => ({
            stream: !!window.localStream,
            audioTracks: window.localStream?.getAudioTracks().length || 0,
            videoTracks: window.localStream?.getVideoTracks().length || 0,
            audioEnabled: window.localStream?.getAudioTracks().every(t => t.enabled) || false,
            videoEnabled: window.localStream?.getVideoTracks().every(t => t.enabled) || false
        }));
        record('WebRTC / média local A', localMediaA.stream && localMediaA.audioTracks > 0 && localMediaA.videoTracks > 0 ? 'PASS' : 'FAIL', localMediaA);

        // 4. Room chat
        await pageA.locator('#desktopRoomChatButton').click().catch(async () => {
            await pageA.evaluate(() => window.toggleRoomChat?.());
        });
        await pageA.locator('#roomChatInput').fill('QA_ROOM_MESSAGE');
        await pageA.locator('.room-chat .chat-send').click();
        await pageA.waitForFunction(() => (document.querySelector('#roomChatMessages')?.innerText || '').includes('QA_ROOM_MESSAGE'), { timeout: 15000 });
        record('Rooms / chat du salon A', 'PASS');

        // 5. B joins the same room.
        await waitForRoom(pageB, ROOM_NAME);
        await pageB.locator('#roomList').getByText(ROOM_NAME, { exact: true }).first().click().catch(async () => {
            await pageB.evaluate(id => window.joinRoom(id), roomId);
        });
        await pageB.waitForFunction(id => window.currentRoom?.id === id, roomId, { timeout: 20000 });
        await waitVisible(pageB, '#roomScreen', 10000);
        record('Rooms / B rejoint le salon', 'PASS', { roomId });

        // 6. Participant discovery on both sides.
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

        // 7. Room chat delivery A -> B.
        await pageA.locator('#roomChatInput').fill('QA_ROOM_A_TO_B');
        await pageA.locator('.room-chat .chat-send').click();
        await pageB.waitForFunction(() => (document.querySelector('#roomChatMessages')?.innerText || '').includes('QA_ROOM_A_TO_B'), { timeout: 15000 });
        record('Rooms / chat A → B', 'PASS');

        // 8. WebRTC signaling and connection state.
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

        // 9. Remote media stream must actually reach a video element.
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

        // 10. Camera and microphone toggles are functional.
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

        // 11. Leave room and verify cleanup on A and notification on B.
        await pageA.locator('.leave-btn').click();
        await pageA.waitForFunction(() => !window.currentRoom && !!window.localStream === false, { timeout: 10000 });
        await waitVisible(pageA, '#lobbyScreen', 10000);
        record('Rooms / A quitte le salon + nettoyage', 'PASS', {
            currentRoom: await pageA.evaluate(() => window.currentRoom),
            peers: await pageA.evaluate(() => window.peers?.size ?? null),
            localStream: await pageA.evaluate(() => !!window.localStream)
        });

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

    const report = {
        site: SITE_URL,
        users: [USER_A, USER_B],
        room: ROOM_NAME,
        generatedAt: new Date().toISOString(),
        results
    };
    fs.writeFileSync(`${OUT}/report-rooms-webrtc.json`, JSON.stringify(report, null, 2));

    const failed = results.filter(r => r.status === 'FAIL');
    console.log(`\nRooms + WebRTC QA terminé : ${results.length} contrôles, ${failed.length} échec(s).`);
    process.exitCode = failed.length ? 1 : 0;
})();
