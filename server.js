const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;

const ADMIN_USERNAME = "Riddimz";
const ADMIN_PASSWORD = "85206";

const users = new Map();
const rooms = new Map();

let nextUserId = 1;
let nextRoomId = 1;
let nextMessageId = 1;

// ============================================================
// HTTP SERVER
// ============================================================

const server = http.createServer((req, res) => {

    if (req.url === "/health") {
        res.writeHead(200, {
            "Content-Type": "application/json"
        });

        res.end(JSON.stringify({
            status: "ok"
        }));

        return;
    }

    if (req.url === "/" || req.url === "/index.html") {

        const filePath = path.join(
            __dirname,
            "index.html"
        );

        fs.readFile(filePath, (err, data) => {

            if (err) {

                res.writeHead(500);
                res.end("Erreur serveur");

                return;
            }

            res.writeHead(200, {
                "Content-Type": "text/html; charset=utf-8"
            });

            res.end(data);
        });

        return;
    }

    res.writeHead(404);
    res.end("Not found");
});

// ============================================================
// WEBSOCKET
// ============================================================

const wss = new WebSocket.Server({
    server
});

// ============================================================
// GENERAL ROOM
// ============================================================

const GENERAL_ROOM_ID = "general";

rooms.set(GENERAL_ROOM_ID, {
    id: GENERAL_ROOM_ID,
    name: "Discussion générale",
    ownerId: null,
    users: new Set(),
    createdAt: Date.now(),
    permanent: true
});

// ============================================================
// HELPERS
// ============================================================

function safeSend(ws, data) {

    if (!ws)
        return;

    if (ws.readyState !== WebSocket.OPEN)
        return;

    try {
        ws.send(JSON.stringify(data));
    } catch (error) {
        console.error("WebSocket send error:", error);
    }
}

function broadcast(data, filter = null) {

    for (const user of users.values()) {

        if (!filter || filter(user)) {
            safeSend(user.ws, data);
        }
    }
}

function broadcastRoom(roomId, data, excludeUserId = null) {

    const room = rooms.get(roomId);

    if (!room)
        return;

    for (const userId of room.users) {

        if (userId === excludeUserId)
            continue;

        const user = users.get(userId);

        if (user) {
            safeSend(user.ws, data);
        }
    }
}

function publicUser(user) {

    return {
        id: user.id,
        username: user.username,
        roomId: user.roomId,
        microphoneEnabled: user.microphoneEnabled,
        cameraEnabled: user.cameraEnabled
    };
}

function publicRoom(room) {

    return {
        id: room.id,
        name: room.name,
        ownerId: room.ownerId,
        userCount: room.users.size,
        permanent: !!room.permanent
    };
}

function sendRoomList() {

    const list = [];

    for (const room of rooms.values()) {
        list.push(publicRoom(room));
    }

    broadcast({
        type: "room-list",
        rooms: list
    });
}

function sendUserList() {

    const list = [];

    for (const user of users.values()) {
        list.push(publicUser(user));
    }

    broadcast({
        type: "user-list",
        users: list
    });
}

function removeUserFromRoom(user) {

    if (!user.roomId)
        return;

    const room = rooms.get(user.roomId);

    if (!room) {
        user.roomId = null;
        return;
    }

    room.users.delete(user.id);

    broadcastRoom(room.id, {
        type: "user-left",
        userId: user.id
    });

    user.roomId = null;

    // Suppression automatique des salons normaux
    if (
        !room.permanent &&
        room.users.size === 0
    ) {

        rooms.delete(room.id);
    }

    sendRoomList();
}

function leaveRoom(user) {

    if (!user.roomId)
        return;

    const roomId = user.roomId;

    removeUserFromRoom(user);

    safeSend(user.ws, {
        type: "left-room",
        roomId
    });

    sendUserList();
}

function createChatMessage(user, text, roomId) {

    return {
        type: "chat-message",
        id: nextMessageId++,
        userId: user.id,
        username: user.username,
        text,
        roomId: roomId || null,
        timestamp: Date.now()
    };
}

// ============================================================
// WEBSOCKET CONNECTION
// ============================================================

wss.on("connection", (ws) => {

    let currentUser = null;

    safeSend(ws, {
        type: "connected"
    });

    // --------------------------------------------------------
    // MESSAGE
    // --------------------------------------------------------

    ws.on("message", (raw) => {

        let message;

        try {
            message = JSON.parse(raw.toString());
        } catch (error) {

            safeSend(ws, {
                type: "error",
                message: "Message invalide."
            });

            return;
        }

        // ====================================================
        // LOGIN
        // ====================================================

        if (message.type === "login") {

            const username =
                String(message.username || "").trim();

            const password =
                String(message.password || "");

            if (!username) {

                safeSend(ws, {
                    type: "login-error",
                    message: "Nom d'utilisateur obligatoire."
                });

                return;
            }

            // Un seul compte admin
            const isAdmin =
                username === ADMIN_USERNAME &&
                password === ADMIN_PASSWORD;

            // Vérification mot de passe admin
            if (
                username === ADMIN_USERNAME &&
                !isAdmin
            ) {

                safeSend(ws, {
                    type: "login-error",
                    message: "Identifiants administrateur incorrects."
                });

                return;
            }

            // Éviter les doublons
            for (const existingUser of users.values()) {

                if (
                    existingUser.username.toLowerCase() ===
                    username.toLowerCase()
                ) {

                    safeSend(ws, {
                        type: "login-error",
                        message: "Ce nom d'utilisateur est déjà utilisé."
                    });

                    return;
                }
            }

            const user = {

                id: `user-${nextUserId++}`,

                username,

                isAdmin,

                ws,

                roomId: null,

                microphoneEnabled: true,

                cameraEnabled: true,

                connectedAt: Date.now()
            };

            users.set(user.id, user);

            currentUser = user;

            safeSend(ws, {
                type: "login-success",
                user: publicUser(user),
                isAdmin: user.isAdmin
            });

            // Envoi des salons
            const roomList = [];

            for (const room of rooms.values()) {
                roomList.push(publicRoom(room));
            }

            safeSend(ws, {
                type: "room-list",
                rooms: roomList
            });

            // Envoi des utilisateurs
            const userList = [];

            for (const connectedUser of users.values()) {
                userList.push(publicUser(connectedUser));
            }

            safeSend(ws, {
                type: "user-list",
                users: userList
            });

            // Notification aux autres
            broadcast({
                type: "user-connected",
                user: publicUser(user)
            }, u => u.id !== user.id);

            sendUserList();

            return;
        }

        // ====================================================
        // Après login uniquement
        // ====================================================

        if (!currentUser) {

            safeSend(ws, {
                type: "error",
                message: "Vous devez être connecté."
            });

            return;
        }

        // ====================================================
        // CREATE ROOM
        // ====================================================

        if (message.type === "create-room") {

            const name =
                String(message.name || "").trim();

            if (!name) {

                safeSend(ws, {
                    type: "error",
                    message: "Nom du salon obligatoire."
                });

                return;
            }

            if (name.length > 50) {

                safeSend(ws, {
                    type: "error",
                    message: "Le nom du salon est trop long."
                });

                return;
            }

            const roomId =
                `room-${nextRoomId++}`;

            const room = {

                id: roomId,

                name,

                ownerId: currentUser.id,

                users: new Set(),

                createdAt: Date.now(),

                permanent: false
            };

            rooms.set(roomId, room);

            sendRoomList();

            safeSend(ws, {
                type: "room-created",
                room: publicRoom(room)
            });

            return;
        }

        // ====================================================
        // JOIN ROOM
        // ====================================================

        if (message.type === "join-room") {

            const roomId =
                String(message.roomId || "");

            const room = rooms.get(roomId);

            if (!room) {

                safeSend(ws, {
                    type: "error",
                    message: "Salon introuvable."
                });

                return;
            }

            // Quitter l'ancien salon si nécessaire
            if (currentUser.roomId) {
                removeUserFromRoom(currentUser);
            }

            currentUser.roomId = roomId;

            room.users.add(currentUser.id);

            // Liste des participants déjà présents
            const participants = [];

            for (const userId of room.users) {

                if (userId === currentUser.id)
                    continue;

                const participant =
                    users.get(userId);

                if (participant) {
                    participants.push(
                        publicUser(participant)
                    );
                }
            }

            safeSend(ws, {
                type: "room-joined",
                room: publicRoom(room),
                participants
            });

            // Prévenir les autres
            broadcastRoom(
                roomId,
                {
                    type: "user-joined",
                    user: publicUser(currentUser)
                },
                currentUser.id
            );

            sendRoomList();
            sendUserList();

            return;
        }

        // ====================================================
        // LEAVE ROOM
        // ====================================================

        if (message.type === "leave-room") {

            leaveRoom(currentUser);

            return;
        }

        // ====================================================
        // CHAT
        // ====================================================

        if (message.type === "chat") {

            const text =
                String(message.text || "").trim();

            if (!text)
                return;

            if (text.length > 1000) {

                safeSend(ws, {
                    type: "error",
                    message: "Message trop long."
                });

                return;
            }

            let roomId = null;

            if (
                message.roomId &&
                currentUser.roomId &&
                message.roomId === currentUser.roomId
            ) {

                roomId = currentUser.roomId;
            }

            const chatMessage =
                createChatMessage(
                    currentUser,
                    text,
                    roomId
                );

            // ------------------------------------------------
            // CHAT DU SALON
            // ------------------------------------------------

            if (roomId) {

                // Envoie à tous les participants,
                // y compris l'expéditeur
                broadcastRoom(
                    roomId,
                    chatMessage
                );

                return;
            }

            // ------------------------------------------------
            // CHAT GENERAL
            // ------------------------------------------------

            // Seulement les utilisateurs qui ne sont
            // pas dans un salon
            broadcast(
                chatMessage,
                user => !user.roomId
            );

            return;
        }

        // ====================================================
        // WEBRTC OFFER
        // ====================================================

        if (message.type === "offer") {

            const target =
                users.get(message.targetUserId);

            if (!target)
                return;

            safeSend(target.ws, {
                type: "offer",
                fromUserId: currentUser.id,
                offer: message.offer
            });

            return;
        }

        // ====================================================
        // WEBRTC ANSWER
        // ====================================================

        if (message.type === "answer") {

            const target =
                users.get(message.targetUserId);

            if (!target)
                return;

            safeSend(target.ws, {
                type: "answer",
                fromUserId: currentUser.id,
                answer: message.answer
            });

            return;
        }

        // ====================================================
        // WEBRTC ICE
        // ====================================================

        if (message.type === "candidate") {

            const target =
                users.get(message.targetUserId);

            if (!target)
                return;

            safeSend(target.ws, {
                type: "candidate",
                fromUserId: currentUser.id,
                candidate: message.candidate
            });

            return;
        }

        // ====================================================
        // MEDIA STATE
        // ====================================================

        if (message.type === "media-state") {

            if (
                typeof message.microphoneEnabled ===
                "boolean"
            ) {

                currentUser.microphoneEnabled =
                    message.microphoneEnabled;
            }

            if (
                typeof message.cameraEnabled ===
                "boolean"
            ) {

                currentUser.cameraEnabled =
                    message.cameraEnabled;
            }

            if (currentUser.roomId) {

                broadcastRoom(
                    currentUser.roomId,
                    {
                        type: "remote-media-state",
                        userId: currentUser.id,
                        microphoneEnabled:
                            currentUser.microphoneEnabled,
                        cameraEnabled:
                            currentUser.cameraEnabled
                    },
                    currentUser.id
                );
            }

            sendUserList();

            return;
        }

        // ====================================================
        // ADMIN ACTIONS
        // ====================================================

        if (
            message.type.startsWith("admin-") &&
            !currentUser.isAdmin
        ) {

            safeSend(ws, {
                type: "admin-error",
                message: "Accès administrateur refusé."
            });

            return;
        }

        // ====================================================
        // ADMIN MUTE
        // ====================================================

        if (message.type === "admin-mute") {

            const target =
                users.get(message.userId);

            if (!target)
                return;

            target.microphoneEnabled = false;

            // Mise à jour du navigateur cible
            safeSend(
                target.ws,
                {
                    type: "force-media-state",

                    microphoneEnabled: false,

                    cameraEnabled:
                        target.cameraEnabled,

                    reason: "admin-mute"
                }
            );

            // Informer les autres utilisateurs
            if (target.roomId) {

                broadcastRoom(
                    target.roomId,
                    {
                        type: "remote-media-state",
                        userId: target.id,
                        microphoneEnabled: false,
                        cameraEnabled:
                            target.cameraEnabled
                    },
                    target.id
                );
            }

            sendUserList();

            return;
        }

        // ====================================================
        // ADMIN CAMERA
        // ====================================================

        if (message.type === "admin-camera") {

            const target =
                users.get(message.userId);

            if (!target)
                return;

            target.cameraEnabled = false;

            // Mise à jour du navigateur cible
            safeSend(
                target.ws,
                {
                    type: "force-media-state",

                    microphoneEnabled:
                        target.microphoneEnabled,

                    cameraEnabled: false,

                    reason: "admin-camera"
                }
            );

            // Informer les autres
            if (target.roomId) {

                broadcastRoom(
                    target.roomId,
                    {
                        type: "remote-media-state",
                        userId: target.id,
                        microphoneEnabled:
                            target.microphoneEnabled,
                        cameraEnabled: false
                    },
                    target.id
                );
            }

            sendUserList();

            return;
        }

        // ====================================================
        // ADMIN KICK
        // ====================================================

        if (message.type === "admin-kick") {

            const target =
                users.get(message.userId);

            if (!target)
                return;

            safeSend(target.ws, {
                type: "kicked",
                message: "Vous avez été exclu par l'administrateur."
            });

            if (target.roomId) {
                removeUserFromRoom(target);
            }

            safeSend(target.ws, {
                type: "force-lobby"
            });

            return;
        }

        // ====================================================
        // ADMIN DELETE ROOM
        // ====================================================

        if (message.type === "admin-delete-room") {

            const roomId =
                String(message.roomId || "");

            const room =
                rooms.get(roomId);

            if (!room)
                return;

            if (room.permanent) {

                safeSend(ws, {
                    type: "admin-error",
                    message: "Impossible de supprimer ce salon."
                });

                return;
            }

            // Renvoyer tous les utilisateurs vers le lobby
            for (const userId of room.users) {

                const user =
                    users.get(userId);

                if (!user)
                    continue;

                user.roomId = null;

                safeSend(user.ws, {
                    type: "room-deleted",
                    roomId
                });
            }

            rooms.delete(roomId);

            sendRoomList();
            sendUserList();

            return;
        }

        // ====================================================
        // ADMIN REFRESH
        // ====================================================

        if (message.type === "admin-refresh") {

            const roomList = [];

            for (const room of rooms.values()) {
                roomList.push(publicRoom(room));
            }

            const userList = [];

            for (const user of users.values()) {
                userList.push(publicUser(user));
            }

            safeSend(ws, {
                type: "admin-data",
                rooms: roomList,
                users: userList
            });

            return;
        }
    });

    // ========================================================
    // DISCONNECT
    // ========================================================

    ws.on("close", () => {

        if (!currentUser)
            return;

        console.log(
            `${currentUser.username} disconnected`
        );

        if (currentUser.roomId) {
            removeUserFromRoom(currentUser);
        }

        users.delete(currentUser.id);

        broadcast({
            type: "user-disconnected",
            userId: currentUser.id
        });

        sendRoomList();
        sendUserList();
    });
});

// ============================================================
// START
// ============================================================

server.listen(PORT, () => {

    console.log(
        `Col'inCall server running on port ${PORT}`
    );
});
