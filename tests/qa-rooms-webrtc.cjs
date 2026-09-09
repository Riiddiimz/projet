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

    const userMode = await visibleButtonContaining(page, 'Utilisateur');
    if (userMode) {
        await userMode.click();
        await page.waitForTimeout(300);
    }

    const usernameInput = page.locator('#userUsernameInput, #usernameInput').first();
    await usernameInput.waitFor({ state: 'visible', timeout: 15000 });
    await usernameInput.fill(username);

    const passwordInput = page.locator('#passwordInput').first();
    if (await passwordInput.isVisible().catch(() => false)) await passwordInput.fill('');

    const connectButton = await visibleButtonContaining(page, 'Se connecter');
    if (!connectButton) throw new Error('Bouton Se connecter introuvable');
    await connectButton.click();

    await waitVisible(page, '#lobbyScreen', 30000);
}

async function waitForRoom(page, roomName) {
    await page.waitForFunction(name => {
        const text = document.querySelector('#roomList')?.innerText || '';
        return text.includes(name);
    }, roomName, { timeout: 20000 });
}

async function roomIdFor(page, roomName) {
    return page.evaluate(name => {
        const cards = [...document.querySelectorAll('#roomList .room-card')];
        const card = cards.find(c => c.querySelector('.room-card-name')?.textContent?.trim() === name);
        const button = card?.querySelector('.join-room-btn');
        const onclick = button?.getAttribute('onclick') || '';
        return onclick.match(/joinRoom\(['\"]([^'\"]+)['\"]\)/)?.[1] || null;
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

    // Instrumente chaque RTCPeerConnection avant le chargement de l'application.
    // Cela permet de vérifier l'état réel des connexions, et pas seulement la présence
    // d'un MediaStream dans une balise <video>.
    const installPeerInstrumentation = async context => {
        await context.addInitScript(() => {
            const OriginalRTCPeerConnection = window.RTCPeerConnection;
            if (!OriginalRTCPeerConnection) return;

            const peers = [];
            window.__qaPeerConnections = peers;

            window.RTCPeerConnection = function(...args) {
                const pc = new OriginalRTCPeerConnection(...args);
                const info = {
                    pc,
                    createdAt: Date.now(),
                    connectionState: pc.connectionState,
                    iceConnectionState: pc.iceConnectionState,
                    signalingState: pc.signalingState
                };
                const update = () => {
                    info.connectionState = pc.connectionState;
                    info.iceConnectionState = pc.iceConnectionState;
                    info.signalingState = pc.signalingState;
                    info.updatedAt = Date.now();
                };
                pc.addEventListener('connectionstatechange', update);
                pc.addEventListener('iceconnectionstatechange', update);
                pc.addEventListener('signalingstatechange', update);
                peers.push(info);
                return pc;
            };
            window.RTCPeerConnection.prototype = OriginalRTCPeerConnection.prototype;
            Object.setPrototypeOf(window.RTCPeerConnection, OriginalRTCPeerConnection);
        });
    };

    await installPeerInstrumentation(contextA);
    await installPeerInstrumentation(contextB);

    try {
        console.log(`\n===== ROOMS + WEBRTC QA / ${USER_A} + ${USER_B} =====`);

        await login(pageA, USER_A);
        record('Rooms / A connecté', 'PASS', { username: USER_A });

        await login(pageB, USER_B);
        record('Rooms / B connecté', 'PASS', { username: USER_B });

        let roomPromptSeen = false;
        pageA.once('dialog', async dialog => {
            roomPromptSeen = true;
            if (dialog.type() !== 'prompt') {
                await dialog.dismiss();
                throw new Error(`Dialogue inattendu lors de la création : ${dialog.type()}`);
            }
            await dialog.accept(ROOM_NAME);
        });

        const createButton = await visibleButtonContaining(pageA, 'Créer un salon');
        if (!createButton) throw new Error('Bouton Créer un salon introuvable');
        await createButton.click();
        await pageA.waitForTimeout(300);
        if (!roomPromptSeen) throw new Error('Le prompt de création du salon n\'a pas été affiché');

        await waitForRoom(pageA, ROOM_NAME);
        await waitForRoom(pageB, ROOM_NAME);
        record('Rooms / création du salon', 'PASS', { room: ROOM_NAME });

        const roomId = await roomIdFor(pageA, ROOM_NAME);
        if (!roomId) throw new Error('ID du salon non trouvé après création');

        const roomCard = pageA.locator('#roomList .room-card').filter({ hasText: ROOM_NAME }).first();
        await roomCard.waitFor({ state: 'visible', timeout: 15000 });
        await roomCard.locator('.join-room-btn').click();

        await waitVisible(pageA, '#roomScreen', 20000);
        await pageA.waitForFunction(() => document.querySelectorAll('#videoGrid .video-card').length >= 1, { timeout: 10000 });
        record('Rooms / A rejoint le salon', 'PASS', {
            roomId,
            cards: await pageA.locator('#videoGrid .video-card').count()
        });

        const localMediaA = await pageA.evaluate(() => {
            const localCard = document.querySelector('#videoGrid .video-card');
            const video = localCard?.querySelector('video');
            const stream = video?.srcObject;
            return {
                stream: !!stream,
                audioTracks: stream?.getAudioTracks().length || 0,
                videoTracks: stream?.getVideoTracks().length || 0,
                audioEnabled: stream?.getAudioTracks().every(t => t.enabled) || false,
                videoEnabled: stream?.getVideoTracks().every(t => t.enabled) || false
            };
        });
        record('WebRTC / média local A', localMediaA.stream && localMediaA.audioTracks > 0 && localMediaA.videoTracks > 0 ? 'PASS' : 'FAIL', localMediaA);

        await pageA.locator('#desktopRoomChatButton').click().catch(async () => {
            await pageA.evaluate(() => window.toggleRoomChat?.());
        });
        await pageA.locator('#roomChatInput').fill('QA_ROOM_MESSAGE');
        await pageA.locator('.room-chat .chat-send').click();
        await pageA.waitForFunction(() => (document.querySelector('#roomChatMessages')?.innerText || '').includes('QA_ROOM_MESSAGE'), { timeout: 15000 });
        record('Rooms / chat du salon A', 'PASS');

        await waitForRoom(pageB, ROOM_NAME);
        const roomCardB = pageB.locator('#roomList .room-card').filter({ hasText: ROOM_NAME }).first();
        await roomCardB.waitFor({ state: 'visible', timeout: 15000 });
        await roomCardB.locator('.join-room-btn').click();
        await waitVisible(pageB, '#roomScreen', 20000);
        record('Rooms / B rejoint le salon', 'PASS', { roomId });

        await pageA.waitForFunction(username => {
            return [...document.querySelectorAll('#videoGrid .video-card')].some(card => (card.innerText || '').includes(username));
        }, USER_B, { timeout: 20000 });
        await pageB.waitForFunction(username => {
            return [...document.querySelectorAll('#videoGrid .video-card')].some(card => (card.innerText || '').includes(username));
        }, USER_A, { timeout: 20000 });

        const participantState = await pageA.evaluate(() => ({
            cards: document.querySelectorAll('#videoGrid .video-card').length
        }));
        record('WebRTC / participants visibles', participantState.cards >= 2 ? 'PASS' : 'FAIL', participantState);

        await pageA.locator('#roomChatInput').fill('QA_ROOM_A_TO_B');
        await pageA.locator('.room-chat .chat-send').click();
        await pageB.waitForFunction(() => (document.querySelector('#roomChatMessages')?.innerText || '').includes('QA_ROOM_A_TO_B'), { timeout: 15000 });
        record('Rooms / chat A → B', 'PASS');

        // Vérification renforcée de la connexion WebRTC : on attend une connexion
        // réellement établie côté RTCPeerConnection sur au moins un des pairs.
        const peerConnectionState = await Promise.race([
            pageA.waitForFunction(() => {
                return (window.__qaPeerConnections || []).some(info =>
                    info.connectionState === 'connected' || info.iceConnectionState === 'connected' || info.iceConnectionState === 'completed'
                );
            }, { timeout: 20000 }).then(() => 'A'),
            pageB.waitForFunction(() => {
                return (window.__qaPeerConnections || []).some(info =>
                    info.connectionState === 'connected' || info.iceConnectionState === 'connected' || info.iceConnectionState === 'completed'
                );
            }, { timeout: 20000 }).then(() => 'B')
        ]).catch(() => null);

        const peerDetails = await pageA.evaluate(() => (window.__qaPeerConnections || []).map(info => ({
            connectionState: info.connectionState,
            iceConnectionState: info.iceConnectionState,
            signalingState: info.signalingState
        })));
        const peerDetailsB = await pageB.evaluate(() => (window.__qaPeerConnections || []).map(info => ({
            connectionState: info.connectionState,
            iceConnectionState: info.iceConnectionState,
            signalingState: info.signalingState
        })));
        const allPeerDetails = [...peerDetails.map(p => ({ side: 'A', ...p })), ...peerDetailsB.map(p => ({ side: 'B', ...p }))];
        record('WebRTC / RTCPeerConnection établie', peerConnectionState ? 'PASS' : 'FAIL', {
            connectedSide: peerConnectionState,
            peers: allPeerDetails
        });

        const remoteMedia = await pageA.waitForFunction(username => {
            const cards = [...document.querySelectorAll('#videoGrid .video-card')];
            const card = cards.find(c => (c.innerText || '').includes(username));
            const video = card?.querySelector('video');
            return !!(video?.srcObject && video.srcObject.getTracks().length);
        }, USER_B, { timeout: 20000 }).then(() => true).catch(() => false);
        const remoteDetails = await pageA.evaluate(username => {
            const card = [...document.querySelectorAll('#videoGrid .video-card')].find(c => (c.innerText || '').includes(username));
            const video = card?.querySelector('video');
            const stream = video?.srcObject;
            return {
                found: !!card,
                hasSrcObject: !!stream,
                tracks: stream?.getTracks().length || 0,
                audioTracks: stream?.getAudioTracks().length || 0,
                videoTracks: stream?.getVideoTracks().length || 0,
                readyState: video?.readyState ?? null,
                videoWidth: video?.videoWidth ?? 0,
                videoHeight: video?.videoHeight ?? 0
            };
        }, USER_B);
        record('WebRTC / flux distant reçu', remoteMedia ? 'PASS' : 'FAIL', remoteDetails);

        const beforeMedia = await pageA.evaluate(() => {
            const video = document.querySelector('#videoGrid .video-card video');
            const stream = video?.srcObject;
            return {
                microphoneEnabled: stream?.getAudioTracks()[0]?.enabled ?? null,
                cameraEnabled: stream?.getVideoTracks()[0]?.enabled ?? null
            };
        });
        await pageA.locator('#microBtn').click();
        await pageA.locator('#cameraBtn').click();
        const afterMedia = await pageA.evaluate(() => {
            const video = document.querySelector('#videoGrid .video-card video');
            const stream = video?.srcObject;
            return {
                microphoneEnabled: stream?.getAudioTracks()[0]?.enabled ?? null,
                cameraEnabled: stream?.getVideoTracks()[0]?.enabled ?? null
            };
        });
        record('WebRTC / contrôles micro-caméra',
            beforeMedia.microphoneEnabled !== afterMedia.microphoneEnabled && beforeMedia.cameraEnabled !== afterMedia.cameraEnabled
                ? 'PASS' : 'FAIL',
            { before: beforeMedia, after: afterMedia });

        // Vérifie que la sortie de A ferme réellement ses PeerConnections et arrête
        // ses pistes média, pas seulement que l'écran du salon disparaît.
        await pageA.locator('.leave-btn').click();
        await waitVisible(pageA, '#lobbyScreen', 10000);
        const cleanupState = await pageA.evaluate(() => {
            const roomScreen = document.querySelector('#roomScreen');
            const roomVisible = (() => {
                if (!roomScreen) return false;
                const s = getComputedStyle(roomScreen);
                const r = roomScreen.getBoundingClientRect();
                return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
            })();
            const videos = [...document.querySelectorAll('#videoGrid .video-card video')];
            const activeTracks = videos.flatMap(video => video.srcObject?.getTracks() || []).filter(track => track.readyState !== 'ended').length;
            const peers = (window.__qaPeerConnections || []).map(info => ({
                connectionState: info.connectionState,
                iceConnectionState: info.iceConnectionState,
                signalingState: info.signalingState
            }));
            return {
                roomVisible,
                cards: document.querySelectorAll('#videoGrid .video-card').length,
                localVideoStream: !!videos[0]?.srcObject,
                activeTracks,
                peers
            };
        });
        const peersClosed = cleanupState.peers.length === 0 || cleanupState.peers.every(p =>
            p.connectionState === 'closed' || p.iceConnectionState === 'closed'
        );
        record('Rooms / A quitte le salon + nettoyage WebRTC',
            !cleanupState.roomVisible && cleanupState.cards === 0 && !cleanupState.localVideoStream && cleanupState.activeTracks === 0 && peersClosed
                ? 'PASS' : 'FAIL',
            cleanupState);

        await pageB.waitForFunction(username => {
            return ![...document.querySelectorAll('#videoGrid .video-card')].some(card => (card.innerText || '').includes(username));
        }, USER_A, { timeout: 15000 });
        record('Rooms / B voit le départ de A', 'PASS');

        const remoteAfterLeave = await pageB.evaluate(username => {
            const card = [...document.querySelectorAll('#videoGrid .video-card')].find(c => (c.innerText || '').includes(username));
            return {
                participantStillVisible: !!card,
                videoTracks: card?.querySelector('video')?.srcObject?.getVideoTracks().length || 0,
                audioTracks: card?.querySelector('video')?.srcObject?.getAudioTracks().length || 0
            };
        }, USER_A);
        record('WebRTC / flux distant supprimé après départ', !remoteAfterLeave.participantStillVisible && remoteAfterLeave.videoTracks === 0 && remoteAfterLeave.audioTracks === 0 ? 'PASS' : 'FAIL', remoteAfterLeave);

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
        results
    }, null, 2));

    const failures = results.filter(r => r.status === 'FAIL');
    console.log(`\nRooms + WebRTC QA terminé : ${results.length} contrôles, ${failures.length} échec(s).`);
    if (failures.length) process.exitCode = 1;
})();
