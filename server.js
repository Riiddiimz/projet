const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "Riddimz";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const MAX_AVATAR_LENGTH = 300000;
const MAX_DESCRIPTION_LENGTH = 300;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const users = new Map();
const rooms = new Map();
const sessions = new Map();

let nextUserId = 1;
let nextRoomId = 1;
let nextMessageId = 1;

const server = http.createServer((req, res) => {
    if (req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
        return;
    }

    if (req.url === "/" || req.url === "/index.html") {
        fs.readFile(path.join(__dirname, "index.html"), (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end("Erreur serveur");
                return;
            }
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(data);
        });
        return;
    }

    res.writeHead(404);
    res.end("Not found");
});

const wss = new WebSocket.Server({ server });

const GENERAL_ROOM_ID = "general";
rooms.set(GENERAL_ROOM_ID, {
    id: GENERAL_ROOM_ID,
    name: "Discussion générale",
    ownerId: null,
    users: new Set(),
    createdAt: Date.now(),
    permanent: true
});

function safeSend(ws, data) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    try {
        ws.send(JSON.stringify(data));
        return true;
    } catch (error) {
        console.error("WebSocket send error:", error);
        return false;
    }
}

function isOnline(user) {
    return !!(user && user.ws && user.ws.readyState === WebSocket.OPEN);
}

function broadcast(data, filter = null) {
    for (const user of users.values()) {
        if (!filter || filter(user)) safeSend(user.ws, data);
    }
}

function broadcastRoom(roomId, data, excludeUserId = null) {
    const room = rooms.get(roomId);
    if (!room) return;

    for (const userId of room.users) {
        if (userId === excludeUserId) continue;
        const user = users.get(userId);
        if (isOnline(user)) safeSend(user.ws, data);
    }
}

function publicUser(user) {
    return {
        id: user.id,
        username: user.username,
        isAdmin: !!user.isAdmin,
        roomId: user.roomId,
        microphoneEnabled: !!user.microphoneEnabled,
        cameraEnabled: !!user.cameraEnabled,
        description: user.description || "",
        avatarUrl: user.avatarUrl || null
    };
}

function publicRoom(room) {
    return {
        id: room.id,
        name: room.name,
        ownerId: room.ownerId,
        userCount: [...room.users].filter(id => isOnline(users.get(id))).length,
        permanent: !!room.permanent
    };
}

function sendRoomList() {
    broadcast({ type: "room-list", rooms: [...rooms.values()].map(publicRoom) });
}

function sendUserList() {
    broadcast({ type: "user-list", users: [...users.values()].map(publicUser) });
    sendOnlineUserList();
}

function sendOnlineUserList() {
    broadcast({
        type: "online-user-list",
        users: [...users.values()].filter(isOnline).map(publicUser)
    });
}

function removeUserFromRoom(user, notify = true) {
    if (!user || !user.roomId) return;

    const roomId = user.roomId;
    const room = rooms.get(roomId);
    user.roomId = null;
    user.microphoneEnabled = false;
    user.cameraEnabled = false;

    if (!room) return;

    room.users.delete(user.id);

    if (notify) {
        broadcastRoom(roomId, { type: "room-user-left", userId: user.id });
    }

    if (!room.permanent && room.users.size === 0) {
        rooms.delete(roomId);
    }

    sendRoomList();
    sendUserList();
}

function leaveRoom(user) {
    if (!user?.roomId) return;
    const roomId = user.roomId;
    removeUserFromRoom(user, true);
    safeSend(user.ws, { type: "room-left", roomId });
}

function createChatMessage(user, text, roomId = null) {
    return {
        type: "chat",
        id: nextMessageId++,
        userId: user.id,
        username: user.username,
        text,
        roomId,
        timestamp: Date.now()
    };
}

function generateSessionToken() {
    return crypto.randomBytes(32).toString("hex");
}

function findUserByUsername(username) {
    const normalized = username.toLowerCase();
    for (const user of users.values()) {
        if (user.username.toLowerCase() === normalized) return user;
    }
    return null;
}

function invalidateUserSessions(userId) {
    for (const [token, session] of sessions) {
        if (session.userId === userId) sessions.delete(token);
    }
}

function createSession(user) {
    invalidateUserSessions(user.id);
    const token = generateSessionToken();
    sessions.set(token, { userId: user.id, createdAt: Date.now() });
    return token;
}

function removeUserCompletely(user) {
    if (!user) return;
    removeUserFromRoom(user, true);
    invalidateUserSessions(user.id);
    users.delete(user.id);
    sendUserList();
    sendRoomList();
}

wss.on("connection", ws => {
    let currentUser = null;

    safeSend(ws, { type: "connected" });

    ws.on("message", raw => {
        let message;
        try {
            message = JSON.parse(raw.toString());
        } catch {
            safeSend(ws, { type: "error", message: "Message invalide." });
            return;
        }

        const type = typeof message.type === "string" ? message.type : "";

        if (type === "restore-session") {
            const token = String(message.sessionToken || message.token || "");
            const session = sessions.get(token);

            if (!session || Date.now() - session.createdAt > SESSION_TTL_MS) {
                if (session) sessions.delete(token);
                safeSend(ws, { type: "session-invalid" });
                return;
            }

            const user = users.get(session.userId);
            if (!user) {
                sessions.delete(token);
                safeSend(ws, { type: "session-invalid" });
                return;
            }

            if (user.ws && user.ws !== ws) {
                try { user.ws.close(4001, "Session reprise"); } catch {}
            }

            currentUser = user;
            currentUser.ws = ws;
            currentUser.lastSeenAt = Date.now();

            safeSend(ws, {
                type: "session-restored",
                user: publicUser(currentUser),
                sessionToken: token
            });
            sendRoomList();
            sendUserList();
            return;
        }

        if (type === "login") {
            const username = String(message.username || "").trim();
            const password = String(message.password || "");
            const wantsAdmin = !!message.isAdmin;

            if (!username) {
                safeSend(ws, { type: "login-error", message: "Nom d'utilisateur obligatoire." });
                return;
            }

            const isAdmin = username.toLowerCase() === ADMIN_USERNAME.toLowerCase()
                && !!ADMIN_PASSWORD
                && password === ADMIN_PASSWORD;

            if (wantsAdmin && !isAdmin) {
                safeSend(ws, { type: "login-error", message: "Identifiants administrateur incorrects." });
                return;
            }

            if (username.toLowerCase() === ADMIN_USERNAME.toLowerCase() && !isAdmin) {
                safeSend(ws, { type: "login-error", message: "Ce nom d'utilisateur est réservé." });
                return;
            }

            const existingUser = findUserByUsername(username);

            if (existingUser && isOnline(existingUser)) {
                safeSend(ws, { type: "login-error", message: "Ce nom d'utilisateur est déjà utilisé." });
                return;
            }

            const user = existingUser || {
                id: `user-${nextUserId++}`,
                username,
                isAdmin,
                ws: null,
                roomId: null,
                microphoneEnabled: false,
                cameraEnabled: false,
                description: "",
                avatarUrl: null,
                connectedAt: Date.now(),
                lastSeenAt: Date.now()
            };

            user.username = username;
            user.isAdmin = isAdmin;
            user.ws = ws;
            user.lastSeenAt = Date.now();
            user.microphoneEnabled = false;
            user.cameraEnabled = false;

            users.set(user.id, user);
            currentUser = user;

            const token = createSession(user);

            safeSend(ws, {
                type: "login-success",
                user: publicUser(user),
                sessionToken: token
            });

            sendRoomList();
            sendUserList();
            return;
        }

        if (type === "logout") {
            if (!currentUser) {
                safeSend(ws, { type: "logout-success" });
                return;
            }

            const user = currentUser;
            currentUser = null;
            removeUserCompletely(user);
            safeSend(ws, { type: "logout-success" });
            try { ws.close(1000, "Logout"); } catch {}
            return;
        }

        if (!currentUser) {
            safeSend(ws, { type: "error", message: "Vous devez être connecté." });
            return;
        }

        currentUser.lastSeenAt = Date.now();

        if (type === "update-profile") {
            if (typeof message.description === "string") {
                currentUser.description = message.description.slice(0, MAX_DESCRIPTION_LENGTH);
            }

            if (typeof message.avatarUrl === "string" && message.avatarUrl.length <= MAX_AVATAR_LENGTH) {
                currentUser.avatarUrl = message.avatarUrl;
            } else if (message.avatarUrl === null) {
                currentUser.avatarUrl = null;
            }

            safeSend(ws, { type: "profile-updated", user: publicUser(currentUser) });
            sendUserList();
            return;
        }

        if (type === "create-room") {
            const name = String(message.name || "").trim();
            if (!name) {
                safeSend(ws, { type: "error", message: "Nom du salon obligatoire." });
                return;
            }
            if (name.length > 50) {
                safeSend(ws, { type: "error", message: "Le nom du salon est trop long." });
                return;
            }

            const room = {
                id: `room-${nextRoomId++}`,
                name,
                ownerId: currentUser.id,
                users: new Set(),
                createdAt: Date.now(),
                permanent: false
            };

            rooms.set(room.id, room);
            sendRoomList();
            safeSend(ws, { type: "room-created", room: publicRoom(room) });
            return;
        }

        if (type === "join-room") {
            const roomId = String(message.roomId || "");
            const room = rooms.get(roomId);

            if (!room) {
                safeSend(ws, { type: "error", message: "Salon introuvable." });
                return;
            }

            if (currentUser.roomId) removeUserFromRoom(currentUser, true);

            currentUser.roomId = roomId;
            currentUser.microphoneEnabled = false;
            currentUser.cameraEnabled = false;
            room.users.add(currentUser.id);

            const participants = [...room.users]
                .filter(id => id !== currentUser.id)
                .map(id => users.get(id))
                .filter(isOnline)
                .map(publicUser);

            safeSend(ws, {
                type: "room-joined",
                room: publicRoom(room),
                participants,
                users: participants
            });

            broadcastRoom(roomId, {
                type: "room-user-joined",
                user: publicUser(currentUser)
            }, currentUser.id);

            sendRoomList();
            sendUserList();
            return;
        }

        if (type === "leave-room") {
            leaveRoom(currentUser);
            return;
        }

        if (type === "chat") {
            const text = String(message.text || "").trim();
            if (!text) return;
            if (text.length > 1000) {
                safeSend(ws, { type: "error", message: "Message trop long." });
                return;
            }

            const roomId = message.roomId && currentUser.roomId === message.roomId
                ? currentUser.roomId
                : null;
            const chatMessage = createChatMessage(currentUser, text, roomId);

            if (roomId) {
                broadcastRoom(roomId, chatMessage);
            } else {
                broadcast(chatMessage, user => isOnline(user) && !user.roomId);
            }
            return;
        }

        if (type === "offer" || type === "answer" || type === "candidate") {
            const target = users.get(message.targetId);
            if (!target || !isOnline(target)) return;

            const payload = { type, fromId: currentUser.id };
            if (type === "offer") payload.offer = message.offer;
            if (type === "answer") payload.answer = message.answer;
            if (type === "candidate") payload.candidate = message.candidate;
            safeSend(target.ws, payload);
            return;
        }

        if (type === "media-state") {
            if (typeof message.microphoneEnabled === "boolean") {
                currentUser.microphoneEnabled = message.microphoneEnabled;
            }
            if (typeof message.cameraEnabled === "boolean") {
                currentUser.cameraEnabled = message.cameraEnabled;
            }

            if (currentUser.roomId) {
                broadcastRoom(currentUser.roomId, {
                    type: "remote-media-state",
                    userId: currentUser.id,
                    microphoneEnabled: currentUser.microphoneEnabled,
                    cameraEnabled: currentUser.cameraEnabled
                }, currentUser.id);
            }

            sendUserList();
            return;
        }

        if (type.startsWith("admin-") && !currentUser.isAdmin) {
            safeSend(ws, { type: "admin-error", message: "Accès administrateur refusé." });
            return;
        }

        if (type === "admin-mute" || type === "admin-camera") {
            const target = users.get(message.userId);
            if (!target) return;

            if (type === "admin-mute") target.microphoneEnabled = false;
            if (type === "admin-camera") target.cameraEnabled = false;

            safeSend(target.ws, {
                type: "force-media-state",
                microphoneEnabled: target.microphoneEnabled,
                cameraEnabled: target.cameraEnabled,
                reason: type
            });

            if (target.roomId) {
                broadcastRoom(target.roomId, {
                    type: "remote-media-state",
                    userId: target.id,
                    microphoneEnabled: target.microphoneEnabled,
                    cameraEnabled: target.cameraEnabled
                }, target.id);
            }

            sendUserList();
            return;
        }

        if (type === "admin-kick") {
            const target = users.get(message.userId);
            if (!target) return;

            const targetWs = target.ws;
            removeUserFromRoom(target, true);
            invalidateUserSessions(target.id);
            target.ws = null;

            safeSend(targetWs, {
                type: "force-lobby",
                message: "Vous avez été exclu par l'administrateur."
            });

            if (targetWs) {
                try { targetWs.close(4003, "Kicked"); } catch {}
            }

            sendUserList();
            return;
        }

        if (type === "admin-delete-room") {
            const roomId = String(message.roomId || "");
            const room = rooms.get(roomId);
            if (!room) return;

            if (room.permanent) {
                safeSend(ws, { type: "admin-error", message: "Impossible de supprimer ce salon." });
                return;
            }

            for (const userId of room.users) {
                const user = users.get(userId);
                if (!user) continue;
                user.roomId = null;
                user.microphoneEnabled = false;
                user.cameraEnabled = false;
                safeSend(user.ws, { type: "room-deleted", roomId });
            }

            rooms.delete(roomId);
            sendRoomList();
            sendUserList();
            return;
        }

        if (type === "admin-refresh") {
            safeSend(ws, {
                type: "admin-data",
                rooms: [...rooms.values()].map(publicRoom),
                users: [...users.values()].map(publicUser)
            });
            return;
        }
    });

    ws.on("close", () => {
        if (!currentUser) return;

        const user = currentUser;
        if (user.ws !== ws) return;

        user.ws = null;
        user.lastSeenAt = Date.now();
        user.microphoneEnabled = false;
        user.cameraEnabled = false;

        if (user.roomId) removeUserFromRoom(user, true);

        console.log(`${user.username} disconnected; session retained`);
        sendRoomList();
        sendUserList();
    });
});

setInterval(() => {
    const now = Date.now();

    for (const [token, session] of sessions) {
        if (now - session.createdAt <= SESSION_TTL_MS) continue;

        sessions.delete(token);
        const user = users.get(session.userId);
        if (!user || isOnline(user)) continue;

        users.delete(user.id);
    }

    sendUserList();
    sendRoomList();
}, 60 * 60 * 1000);

if (!ADMIN_PASSWORD) {
    console.warn("ADMIN_PASSWORD is not configured: administrator login is disabled.");
}

server.listen(PORT, () => {
    console.log(`Col'inCall server running on port ${PORT}`);
});
