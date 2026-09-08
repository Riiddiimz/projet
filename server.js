const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const WebSocket = require("ws");

const PORT = process.env.PORT || 10000;

const ADMIN_USERNAME = "Riddimz";
const ADMIN_CODE = "85206";

const users = new Map();
const rooms = new Map();

const GENERAL_ROOM_ID = "general";

rooms.set(GENERAL_ROOM_ID, {
    id: GENERAL_ROOM_ID,
    name: "Général",
    ownerId: null,
    participants: new Set()
});


/* =========================
   HTTP
========================= */

const server = http.createServer((req, res) => {

    if (req.url === "/health") {
        res.writeHead(200, {
            "Content-Type": "text/plain; charset=utf-8"
        });

        res.end("Col'inCall OK");
        return;
    }

    if (req.url === "/" || req.url === "/index.html") {

        const filePath =
            path.join(__dirname, "index.html");

        fs.readFile(filePath, (error, data) => {

            if (error) {
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


/* =========================
   WEBSOCKET
========================= */

const wss = new WebSocket.Server({
    server
});


wss.on("connection", ws => {

    ws.userId = null;

    send(ws, {
        type: "connected"
    });

    ws.on("message", raw => {

        let message;

        try {
            message = JSON.parse(raw.toString());
        } catch {
            sendError(ws, "Message invalide.");
            return;
        }

        handleMessage(ws, message);
    });

    ws.on("close", () => {

        if (!ws.userId) return;

        removeUser(ws.userId);
    });
});


/* =========================
   MESSAGE HANDLER
========================= */

function handleMessage(ws, message) {

    switch (message.type) {

        case "login":
            handleLogin(ws, message);
            break;

        case "update-profile":
            handleUpdateProfile(ws, message);
            break;

        case "create-room":
            handleCreateRoom(ws, message);
            break;

        case "join-room":
            handleJoinRoom(ws, message);
            break;

        case "leave-room":
            handleLeaveRoom(ws);
            break;

        case "chat":
            handleChat(ws, message);
            break;

        case "offer":
            relayToUser(ws, message, "offer");
            break;

        case "answer":
            relayToUser(ws, message, "answer");
            break;

        case "ice-candidate":
            relayToUser(ws, message, "ice-candidate");
            break;

        case "media-state":
            handleMediaState(ws, message);
            break;

        case "admin-mute":
            handleAdminMute(ws, message);
            break;

        case "admin-camera":
            handleAdminCamera(ws, message);
            break;

        case "admin-kick":
            handleAdminKick(ws, message);
            break;

        case "admin-delete-room":
            handleAdminDeleteRoom(ws, message);
            break;

        case "get-room-list":
            sendRoomList(ws);
            break;

        case "get-users":
            sendUsers(ws);
            break;

        default:
            sendError(ws, "Action inconnue.");
    }
}


/* =========================
   LOGIN
========================= */

function handleLogin(ws, message) {

    const username =
        String(message.username || "")
            .trim()
            .slice(0, 24);

    const role =
        message.role === "admin"
            ? "admin"
            : "user";

    if (!username) {
        send(ws, {
            type: "login-error",
            message: "Pseudo obligatoire."
        });

        return;
    }

    if (
        role === "admin" &&
        (
            username !== ADMIN_USERNAME ||
            message.adminCode !== ADMIN_CODE
        )
    ) {

        send(ws, {
            type: "login-error",
            message:
                "Identifiants administrateur incorrects."
        });

        return;
    }

    const duplicate =
        [...users.values()].find(
            user =>
                user.username.toLowerCase() ===
                username.toLowerCase()
        );

    if (duplicate) {

        send(ws, {
            type: "login-error",
            message: "Ce pseudo est déjà utilisé."
        });

        return;
    }

    const id = crypto.randomUUID();

    const user = {
        id,
        username,
        role,
        ws,
        roomId: null,
        muted: false,
        cameraDisabled: false,
        profile: {
            description: "",
            avatar: null
        }
    };

    users.set(id, user);
    ws.userId = id;

    send(ws, {
        type: "login-success",
        user: publicUser(user)
    });

    sendRoomList(ws);

    if (role === "admin") {
        sendUsers(ws);
    }
}


/* =========================
   PROFILE
========================= */

function handleUpdateProfile(ws, message) {

    const user =
        users.get(ws.userId);

    if (!user) return;

    user.profile = {
        description:
            String(message.description || "")
                .slice(0, 1000),

        avatar:
            typeof message.avatar === "string"
                ? message.avatar
                : null
    };

    broadcastUserUpdate(user);

    send(ws, {
        type: "profile-updated",
        user: publicUser(user)
    });
}


/* =========================
   ROOMS
========================= */

function handleCreateRoom(ws, message) {

    const user =
        users.get(ws.userId);

    if (!user) return;

    let name =
        String(message.name || "")
            .trim()
            .slice(0, 50);

    if (!name) {
        sendError(ws, "Nom du salon obligatoire.");
        return;
    }

    const existing =
        [...rooms.values()].find(
            room =>
                room.name.toLowerCase() ===
                name.toLowerCase()
        );

    if (existing) {
        sendError(ws, "Ce salon existe déjà.");
        return;
    }

    const room = {
        id: crypto.randomUUID(),
        name,
        ownerId: user.id,
        participants: new Set()
    };

    rooms.set(room.id, room);

    sendRoomListToAll();
}


function handleJoinRoom(ws, message) {

    const user =
        users.get(ws.userId);

    if (!user) return;

    const room =
        rooms.get(message.roomId);

    if (!room) {
        sendError(ws, "Salon introuvable.");
        return;
    }

    if (user.roomId) {
        removeUserFromRoom(user);
    }

    const participants =
        [...room.participants]
            .map(id => users.get(id))
            .filter(Boolean)
            .map(publicUser);

    room.participants.add(user.id);
    user.roomId = room.id;

    send(ws, {
        type: "room-joined",
        room: publicRoom(room),
        participants
    });

    /*
     * On informe les autres.
     * Le nouvel utilisateur va ensuite créer
     * les offres vers les participants existants.
     */
    broadcastRoom(room, {
        type: "user-joined",
        user: publicUser(user)
    }, user.id);

    sendRoomListToAll();
    sendUsersToAdmins();
}


function handleLeaveRoom(ws) {

    const user =
        users.get(ws.userId);

    if (!user) return;

    if (!user.roomId) return;

    removeUserFromRoom(user);

    send(ws, {
        type: "room-left"
    });

    sendRoomListToAll();
    sendUsersToAdmins();
}


function removeUserFromRoom(user) {

    if (!user.roomId) return;

    const room =
        rooms.get(user.roomId);

    if (!room) {
        user.roomId = null;
        return;
    }

    room.participants.delete(
        user.id
    );

    broadcastRoom(room, {
        type: "user-left",
        userId: user.id
    });

    user.roomId = null;

    /*
     * Les salons créés par les utilisateurs
     * sont supprimés automatiquement lorsqu'ils
     * deviennent complètement vides.
     *
     * Le salon Général reste toujours présent.
     */
    if (
        room.id !== GENERAL_ROOM_ID &&
        room.participants.size === 0
    ) {
        rooms.delete(room.id);
    }
}


/* =========================
   CHAT
========================= */

function handleChat(ws, message) {

    const user =
        users.get(ws.userId);

    if (!user) return;

    const text =
        String(message.text || "")
            .trim()
            .slice(0, 2000);

    if (!text) return;

    /*
     * Pas dans un salon :
     * chat général.
     */
    if (!user.roomId) {

        broadcastAll({
            type: "chat-message",
            roomId: null,
            user: publicUser(user),
            text
        });

        return;
    }

    /*
     * Dans un salon :
     * message envoyé à tous les membres,
     * y compris l'auteur.
     */
    const room =
        rooms.get(user.roomId);

    if (!room) return;

    broadcastRoom(room, {
        type: "chat-message",
        roomId: room.id,
        user: publicUser(user),
        text
    });
}


/* =========================
   WEBRTC
========================= */

function relayToUser(ws, message, type) {

    const sender =
        users.get(ws.userId);

    if (!sender) return;

    const target =
        users.get(message.targetId);

    if (!target) return;

    /*
     * Sécurité :
     * on ne relaie les signaux que si les deux
     * utilisateurs sont dans le même salon.
     */
    if (
        !sender.roomId ||
        sender.roomId !== target.roomId
    ) {
        return;
    }

    send(target.ws, {
        type,
        fromId: sender.id,
        [type === "offer"
            ? "offer"
            : type === "answer"
                ? "answer"
                : "candidate"]:
            type === "offer"
                ? message.offer
                : type === "answer"
                    ? message.answer
                    : message.candidate
    });
}


function handleMediaState(ws, message) {

    const user =
        users.get(ws.userId);

    if (!user || !user.roomId) return;

    const room =
        rooms.get(user.roomId);

    if (!room) return;

    broadcastRoom(room, {
        type: "media-state",
        userId: user.id,
        microphone: Boolean(message.microphone),
        camera: Boolean(message.camera)
    }, user.id);
}


/* =========================
   ADMIN
========================= */

function isAdmin(ws) {

    const user =
        users.get(ws.userId);

    return Boolean(
        user &&
        user.role === "admin"
    );
}


function handleAdminMute(ws, message) {

    if (!isAdmin(ws)) {
        sendError(ws, "Accès administrateur requis.");
        return;
    }

    const target =
        users.get(message.userId);

    if (!target) return;

    target.muted =
        Boolean(message.muted);

    send(target.ws, {
        type: "force-micro",
        enabled: !target.muted
    });

    broadcastUserUpdate(target);

    sendUsersToAdmins();
}


function handleAdminCamera(ws, message) {

    if (!isAdmin(ws)) {
        sendError(ws, "Accès administrateur requis.");
        return;
    }

    const target =
        users.get(message.userId);

    if (!target) return;

    target.cameraDisabled =
        Boolean(message.disabled);

    send(target.ws, {
        type: "force-camera",
        enabled: !target.cameraDisabled
    });

    broadcastUserUpdate(target);

    sendUsersToAdmins();
}


function handleAdminKick(ws, message) {

    if (!isAdmin(ws)) {
        sendError(ws, "Accès administrateur requis.");
        return;
    }

    const target =
        users.get(message.userId);

    if (!target) return;

    if (target.roomId) {
        removeUserFromRoom(target);
    }

    send(target.ws, {
        type: "kicked",
        message:
            "Vous avez été expulsé par l'administrateur."
    });

    target.roomId = null;

    sendRoomListToAll();
    sendUsersToAdmins();
}


function handleAdminDeleteRoom(ws, message) {

    if (!isAdmin(ws)) {
        sendError(ws, "Accès administrateur requis.");
        return;
    }

    const room =
        rooms.get(message.roomId);

    if (!room) return;

    if (room.id === GENERAL_ROOM_ID) {
        sendError(
            ws,
            "Le salon Général ne peut pas être supprimé."
        );

        return;
    }

    for (const userId of room.participants) {

        const user =
            users.get(userId);

        if (!user) continue;

        user.roomId = null;

        send(user.ws, {
            type: "room-deleted",
            roomId: room.id,
            message:
                `Le salon "${room.name}" a été supprimé par l'administrateur.`
        });
    }

    rooms.delete(room.id);

    sendRoomListToAll();
    sendUsersToAdmins();
}


/* =========================
   USERS
========================= */

function removeUser(userId) {

    const user =
        users.get(userId);

    if (!user) return;

    if (user.roomId) {
        removeUserFromRoom(user);
    }

    users.delete(userId);

    sendRoomListToAll();
    sendUsersToAdmins();
}


function sendUsers(ws) {

    if (!isAdmin(ws)) return;

    send(ws, {
        type: "users-list",
        users:
            [...users.values()]
                .map(publicUser)
    });
}


function sendUsersToAdmins() {

    for (const user of users.values()) {

        if (user.role === "admin") {
            sendUsers(user.ws);
        }
    }
}


/* =========================
   ROOM LIST
========================= */

function sendRoomList(ws) {

    send(ws, {
        type: "room-list",
        rooms:
            [...rooms.values()]
                .map(publicRoom)
    });
}


function sendRoomListToAll() {

    for (const user of users.values()) {
        sendRoomList(user.ws);
    }
}


/* =========================
   BROADCAST
========================= */

function broadcastAll(message) {

    for (const user of users.values()) {
        send(user.ws, message);
    }
}


function broadcastRoom(
    room,
    message,
    excludeUserId = null
) {

    for (const userId of room.participants) {

        if (userId === excludeUserId) {
            continue;
        }

        const user =
            users.get(userId);

        if (user) {
            send(user.ws, message);
        }
    }
}


function broadcastUserUpdate(user) {

    broadcastAll({
        type: "user-updated",
        user: publicUser(user)
    });
}


/* =========================
   PUBLIC DATA
========================= */

function publicUser(user) {

    return {
        id: user.id,
        username: user.username,
        role: user.role,
        roomId: user.roomId,
        muted: user.muted,
        cameraDisabled: user.cameraDisabled,
        profile: {
            description:
                user.profile?.description || "",
            avatar:
                user.profile?.avatar || null
        }
    };
}


function publicRoom(room) {

    return {
        id: room.id,
        name: room.name,
        ownerId: room.ownerId,
        count: room.participants.size,
        participants:
            [...room.participants]
                .map(id => users.get(id))
                .filter(Boolean)
                .map(publicUser)
    };
}


/* =========================
   HELPERS
========================= */

function send(ws, data) {

    if (
        ws &&
        ws.readyState === WebSocket.OPEN
    ) {
        ws.send(
            JSON.stringify(data)
        );
    }
}


function sendError(ws, message) {

    send(ws, {
        type: "error-message",
        message
    });
}


/* =========================
   START
========================= */

server.listen(PORT, () => {

    console.log(
        `Col'inCall démarré sur le port ${PORT}`
    );
});
