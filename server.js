const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;

const ADMIN_USERNAME = "Riddimz";
const ADMIN_PASSWORD = "85206";

const users = new Map();
const rooms = new Map();
const sessions = new Map();

let nextUserId = 1;
let nextRoomId = 1;
let nextMessageId = 1;

/* ============================================================
   HTTP SERVER
============================================================ */

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

    if (
        req.url === "/" ||
        req.url === "/index.html"
    ) {

        const filePath =
            path.join(
                __dirname,
                "index.html"
            );

        fs.readFile(
            filePath,
            (err, data) => {

                if (err) {

                    res.writeHead(500);
                    res.end("Erreur serveur");

                    return;
                }

                res.writeHead(200, {
                    "Content-Type":
                        "text/html; charset=utf-8"
                });

                res.end(data);
            }
        );

        return;
    }

    res.writeHead(404);
    res.end("Not found");
});

/* ============================================================
   WEBSOCKET
============================================================ */

const wss =
    new WebSocket.Server({
        server
    });

/* ============================================================
   GENERAL ROOM
============================================================ */

const GENERAL_ROOM_ID =
    "general";

rooms.set(
    GENERAL_ROOM_ID,
    {
        id: GENERAL_ROOM_ID,
        name: "Discussion générale",
        ownerId: null,
        users: new Set(),
        createdAt: Date.now(),
        permanent: true
    }
);

/* ============================================================
   HELPERS
============================================================ */

function safeSend(ws, data) {

    if (!ws)
        return;

    if (
        ws.readyState !==
        WebSocket.OPEN
    )
        return;

    try {

        ws.send(
            JSON.stringify(data)
        );

    } catch (error) {

        console.error(
            "WebSocket send error:",
            error
        );
    }
}

function broadcast(
    data,
    filter = null
) {

    for (
        const user
        of users.values()
    ) {

        if (
            !filter ||
            filter(user)
        ) {

            safeSend(
                user.ws,
                data
            );
        }
    }
}

function broadcastRoom(
    roomId,
    data,
    excludeUserId = null
) {

    const room =
        rooms.get(roomId);

    if (!room)
        return;

    for (
        const userId
        of room.users
    ) {

        if (
            userId ===
            excludeUserId
        )
            continue;

        const user =
            users.get(userId);

        if (user) {

            safeSend(
                user.ws,
                data
            );
        }
    }
}

function publicUser(user) {

    return {

        id:
            user.id,

        username:
            user.username,

        isAdmin:
            user.isAdmin,

        roomId:
            user.roomId,

        microphoneEnabled:
            user.microphoneEnabled,

        cameraEnabled:
            user.cameraEnabled
    };
}

function publicRoom(room) {

    return {

        id:
            room.id,

        name:
            room.name,

        ownerId:
            room.ownerId,

        userCount:
            room.users.size,

        permanent:
            !!room.permanent
    };
}

function sendRoomList() {

    const list = [];

    for (
        const room
        of rooms.values()
    ) {

        list.push(
            publicRoom(room)
        );
    }

    broadcast({
        type:
            "room-list",
        rooms:
            list
    });
}

function sendUserList() {

    const list = [];

    for (
        const user
        of users.values()
    ) {

        list.push(
            publicUser(user)
        );
    }

    broadcast({
        type:
            "user-list",
        users:
            list
    });
}

/* ============================================================
   ROOM MANAGEMENT
============================================================ */

function removeUserFromRoom(user) {

    if (!user.roomId)
        return;

    const roomId =
        user.roomId;

    const room =
        rooms.get(roomId);

    if (!room) {

        user.roomId =
            null;

        return;
    }

    room.users.delete(
        user.id
    );

    broadcastRoom(
        room.id,
        {
            type:
                "user-left",
            userId:
                user.id
        }
    );

    user.roomId =
        null;

    user.microphoneEnabled =
        false;

    user.cameraEnabled =
        false;

    if (
        !room.permanent &&
        room.users.size === 0
    ) {

        rooms.delete(
            room.id
        );
    }

    sendRoomList();
    sendUserList();
}

function leaveRoom(user) {

    if (!user.roomId)
        return;

    const roomId =
        user.roomId;

    removeUserFromRoom(
        user
    );

    safeSend(
        user.ws,
        {
            type:
                "left-room",
            roomId
        }
    );

    sendUserList();
}

/* ============================================================
   CHAT
============================================================ */

function createChatMessage(
    user,
    text,
    roomId
) {

    return {

        type:
            "chat-message",

        id:
            nextMessageId++,

        userId:
            user.id,

        username:
            user.username,

        text,

        roomId:
            roomId || null,

        timestamp:
            Date.now()
    };
}

/* ============================================================
   SESSION
============================================================ */

function generateSessionToken() {

    return (
        Date.now().toString(36) +
        "-" +
        Math.random()
            .toString(36)
            .substring(2) +
        "-" +
        Math.random()
            .toString(36)
            .substring(2)
    );
}

/* ============================================================
   WEBSOCKET CONNECTION
============================================================ */

wss.on(
    "connection",
    ws => {

        let currentUser = null;

        safeSend(
            ws,
            {
                type:
                    "connected"
            }
        );

        ws.on(
            "message",
            raw => {

                let message;

                try {

                    message =
                        JSON.parse(
                            raw.toString()
                        );

                } catch (error) {

                    safeSend(
                        ws,
                        {
                            type:
                                "error",
                            message:
                                "Message invalide."
                        }
                    );

                    return;
                }

                /* =================================================
                   RESTORE SESSION
                ================================================= */

                if (
                    message.type ===
                    "restore-session"
                ) {

                    const token =
                        String(
                            message.token ||
                            ""
                        );

                    const session =
                        sessions.get(
                            token
                        );

                    if (!session) {

                        safeSend(
                            ws,
                            {
                                type:
                                    "session-invalid"
                            }
                        );

                        return;
                    }

                    currentUser =
                        users.get(
                            session.userId
                        );

                    if (!currentUser) {

                        sessions.delete(
                            token
                        );

                        safeSend(
                            ws,
                            {
                                type:
                                    "session-invalid"
                            }
                        );

                        return;
                    }

                    /*
                     * Une seule connexion active
                     * pour le même utilisateur.
                     */
                    if (
                        currentUser.ws &&
                        currentUser.ws !== ws
                    ) {

                        try {

                            currentUser.ws.close();

                        } catch (e) {}
                    }

                    currentUser.ws =
                        ws;

                    safeSend(
                        ws,
                        {
                            type:
                                "session-restored",

                            user:
                                publicUser(
                                    currentUser
                                ),

                            isAdmin:
                                currentUser.isAdmin
                        }
                    );

                    sendRoomList();

                    sendUserList();

                    return;
                }

                /* =================================================
                   LOGIN
                ================================================= */

                if (
                    message.type ===
                    "login"
                ) {

                    const username =
                        String(
                            message.username ||
                            ""
                        ).trim();

                    const password =
                        String(
                            message.password ||
                            ""
                        );

                    if (!username) {

                        safeSend(
                            ws,
                            {
                                type:
                                    "login-error",

                                message:
                                    "Nom d'utilisateur obligatoire."
                            }
                        );

                        return;
                    }

                    const isAdmin =
                        username ===
                            ADMIN_USERNAME &&
                        password ===
                            ADMIN_PASSWORD;

                    if (
                        username ===
                            ADMIN_USERNAME &&
                        !isAdmin
                    ) {

                        safeSend(
                            ws,
                            {
                                type:
                                    "login-error",

                                message:
                                    "Identifiants administrateur incorrects."
                            }
                        );

                        return;
                    }

                    /*
                     * Empêcher deux utilisateurs avec
                     * le même pseudo.
                     *
                     * Un utilisateur temporairement déconnecté
                     * est considéré comme toujours connecté
                     * afin que sa session puisse être restaurée.
                     */
                    for (
                        const existingUser
                        of users.values()
                    ) {

                        if (
                            existingUser.username
                                .toLowerCase() ===
                            username.toLowerCase()
                        ) {

                            safeSend(
                                ws,
                                {
                                    type:
                                        "login-error",

                                    message:
                                        "Ce nom d'utilisateur est déjà utilisé."
                                }
                            );

                            return;
                        }
                    }

                    const user = {

                        id:
                            `user-${nextUserId++}`,

                        username,

                        isAdmin,

                        ws,

                        roomId:
                            null,

                        microphoneEnabled:
                            false,

                        cameraEnabled:
                            false,

                        connectedAt:
                            Date.now()
                    };

                    users.set(
                        user.id,
                        user
                    );

                    currentUser =
                        user;

                    const token =
                        generateSessionToken();

                    sessions.set(
                        token,
                        {
                            userId:
                                user.id,

                            createdAt:
                                Date.now()
                        }
                    );

                    safeSend(
                        ws,
                        {
                            type:
                                "login-success",

                            user:
                                publicUser(user),

                            isAdmin:
                                user.isAdmin,

                            sessionToken:
                                token
                        }
                    );

                    sendRoomList();

                    sendUserList();

                    broadcast(
                        {
                            type:
                                "user-connected",

                            user:
                                publicUser(user)
                        },
                        u =>
                            u.id !==
                            user.id
                    );

                    return;
                }

                /* =================================================
                   REQUIRE LOGIN
                ================================================= */

                if (!currentUser) {

                    safeSend(
                        ws,
                        {
                            type:
                                "error",

                            message:
                                "Vous devez être connecté."
                        }
                    );

                    return;
                }

                /* =================================================
                   CREATE ROOM
                ================================================= */

                if (
                    message.type ===
                    "create-room"
                ) {

                    const name =
                        String(
                            message.name ||
                            ""
                        ).trim();

                    if (!name) {

                        safeSend(
                            ws,
                            {
                                type:
                                    "error",

                                message:
                                    "Nom du salon obligatoire."
                            }
                        );

                        return;
                    }

                    if (
                        name.length > 50
                    ) {

                        safeSend(
                            ws,
                            {
                                type:
                                    "error",

                                message:
                                    "Le nom du salon est trop long."
                            }
                        );

                        return;
                    }

                    const roomId =
                        `room-${nextRoomId++}`;

                    const room = {

                        id:
                            roomId,

                        name,

                        ownerId:
                            currentUser.id,

                        users:
                            new Set(),

                        createdAt:
                            Date.now(),

                        permanent:
                            false
                    };

                    rooms.set(
                        roomId,
                        room
                    );

                    sendRoomList();

                    safeSend(
                        ws,
                        {
                            type:
                                "room-created",

                            room:
                                publicRoom(room)
                        }
                    );

                    return;
                }

                /* =================================================
                   JOIN ROOM
                ================================================= */

                if (
                    message.type ===
                    "join-room"
                ) {

                    const roomId =
                        String(
                            message.roomId ||
                            ""
                        );

                    const room =
                        rooms.get(
                            roomId
                        );

                    if (!room) {

                        safeSend(
                            ws,
                            {
                                type:
                                    "error",

                                message:
                                    "Salon introuvable."
                            }
                        );

                        return;
                    }

                    if (
                        currentUser.roomId
                    ) {

                        removeUserFromRoom(
                            currentUser
                        );
                    }

                    currentUser.roomId =
                        roomId;

                    currentUser.microphoneEnabled =
                        false;

                    currentUser.cameraEnabled =
                        false;

                    room.users.add(
                        currentUser.id
                    );

                    const participants = [];

                    for (
                        const userId
                        of room.users
                    ) {

                        if (
                            userId ===
                            currentUser.id
                        )
                            continue;

                        const participant =
                            users.get(
                                userId
                            );

                        if (participant) {

                            participants.push(
                                publicUser(
                                    participant
                                )
                            );
                        }
                    }

                    safeSend(
                        ws,
                        {
                            type:
                                "room-joined",

                            room:
                                publicRoom(room),

                            participants
                        }
                    );

                    broadcastRoom(
                        roomId,
                        {
                            type:
                                "user-joined",

                            user:
                                publicUser(
                                    currentUser
                                )
                        },
                        currentUser.id
                    );

                    sendRoomList();
                    sendUserList();

                    return;
                }

                /* =================================================
                   LEAVE ROOM
                ================================================= */

                if (
                    message.type ===
                    "leave-room"
                ) {

                    leaveRoom(
                        currentUser
                    );

                    return;
                }

                /* =================================================
                   CHAT
                ================================================= */

                if (
                    message.type ===
                    "chat"
                ) {

                    const text =
                        String(
                            message.text ||
                            ""
                        ).trim();

                    if (!text)
                        return;

                    if (
                        text.length > 1000
                    ) {

                        safeSend(
                            ws,
                            {
                                type:
                                    "error",

                                message:
                                    "Message trop long."
                            }
                        );

                        return;
                    }

                    let roomId = null;

                    /*
                     * Un utilisateur ne peut envoyer
                     * dans un salon que s'il y est réellement.
                     */
                    if (
                        message.roomId &&
                        currentUser.roomId &&
                        message.roomId ===
                            currentUser.roomId
                    ) {

                        roomId =
                            currentUser.roomId;
                    }

                    const chatMessage =
                        createChatMessage(
                            currentUser,
                            text,
                            roomId
                        );

                    if (roomId) {

                        /*
                         * Le serveur envoie le message
                         * à tous les membres du salon,
                         * y compris l'expéditeur.
                         *
                         * Le frontend ignore son propre message
                         * pour le compteur de non-lus.
                         */
                        broadcastRoom(
                            roomId,
                            chatMessage
                        );

                        return;
                    }

                    /*
                     * Discussion générale :
                     * seuls les utilisateurs du lobby
                     * reçoivent le message.
                     */
                    broadcast(
                        chatMessage,
                        user =>
                            !user.roomId
                    );

                    return;
                }

                /* =================================================
                   WEBRTC OFFER
                ================================================= */

                if (
                    message.type ===
                    "offer"
                ) {

                    const target =
                        users.get(
                            message.targetUserId
                        );

                    if (!target)
                        return;

                    safeSend(
                        target.ws,
                        {
                            type:
                                "offer",

                            fromUserId:
                                currentUser.id,

                            offer:
                                message.offer
                        }
                    );

                    return;
                }

                /* =================================================
                   WEBRTC ANSWER
                ================================================= */

                if (
                    message.type ===
                    "answer"
                ) {

                    const target =
                        users.get(
                            message.targetUserId
                        );

                    if (!target)
                        return;

                    safeSend(
                        target.ws,
                        {
                            type:
                                "answer",

                            fromUserId:
                                currentUser.id,

                            answer:
                                message.answer
                        }
                    );

                    return;
                }

                /* =================================================
                   WEBRTC ICE
                ================================================= */

                if (
                    message.type ===
                    "candidate"
                ) {

                    const target =
                        users.get(
                            message.targetUserId
                        );

                    if (!target)
                        return;

                    safeSend(
                        target.ws,
                        {
                            type:
                                "candidate",

                            fromUserId:
                                currentUser.id,

                            candidate:
                                message.candidate
                        }
                    );

                    return;
                }

                /* =================================================
                   MEDIA STATE
                ================================================= */

                if (
                    message.type ===
                    "media-state"
                ) {

                    if (
                        typeof
                        message.microphoneEnabled ===
                        "boolean"
                    ) {

                        currentUser.microphoneEnabled =
                            message.microphoneEnabled;
                    }

                    if (
                        typeof
                        message.cameraEnabled ===
                        "boolean"
                    ) {

                        currentUser.cameraEnabled =
                            message.cameraEnabled;
                    }

                    if (
                        currentUser.roomId
                    ) {

                        broadcastRoom(
                            currentUser.roomId,
                            {
                                type:
                                    "remote-media-state",

                                userId:
                                    currentUser.id,

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

                /* =================================================
                   ADMIN SECURITY
                ================================================= */

                if (
                    message.type.startsWith(
                        "admin-"
                    ) &&
                    !currentUser.isAdmin
                ) {

                    safeSend(
                        ws,
                        {
                            type:
                                "admin-error",

                            message:
                                "Accès administrateur refusé."
                        }
                    );

                    return;
                }

                /* =================================================
                   ADMIN MUTE
                ================================================= */

                if (
                    message.type ===
                    "admin-mute"
                ) {

                    const target =
                        users.get(
                            message.userId
                        );

                    if (!target)
                        return;

                    target.microphoneEnabled =
                        false;

                    safeSend(
                        target.ws,
                        {
                            type:
                                "force-media-state",

                            microphoneEnabled:
                                false,

                            cameraEnabled:
                                target.cameraEnabled,

                            reason:
                                "admin-mute"
                        }
                    );

                    if (
                        target.roomId
                    ) {

                        broadcastRoom(
                            target.roomId,
                            {
                                type:
                                    "remote-media-state",

                                userId:
                                    target.id,

                                microphoneEnabled:
                                    false,

                                cameraEnabled:
                                    target.cameraEnabled
                            },
                            target.id
                        );
                    }

                    sendUserList();

                    return;
                }

                /* =================================================
                   ADMIN CAMERA
                ================================================= */

                if (
                    message.type ===
                    "admin-camera"
                ) {

                    const target =
                        users.get(
                            message.userId
                        );

                    if (!target)
                        return;

                    target.cameraEnabled =
                        false;

                    safeSend(
                        target.ws,
                        {
                            type:
                                "force-media-state",

                            microphoneEnabled:
                                target.microphoneEnabled,

                            cameraEnabled:
                                false,

                            reason:
                                "admin-camera"
                        }
                    );

                    if (
                        target.roomId
                    ) {

                        broadcastRoom(
                            target.roomId,
                            {
                                type:
                                    "remote-media-state",

                                userId:
                                    target.id,

                                microphoneEnabled:
                                    target.microphoneEnabled,

                                cameraEnabled:
                                    false
                            },
                            target.id
                        );
                    }

                    sendUserList();

                    return;
                }

                /* =================================================
                   ADMIN KICK
                ================================================= */

                if (
                    message.type ===
                    "admin-kick"
                ) {

                    const target =
                        users.get(
                            message.userId
                        );

                    if (!target)
                        return;

                    safeSend(
                        target.ws,
                        {
                            type:
                                "kicked",

                            message:
                                "Vous avez été exclu par l'administrateur."
                        }
                    );

                    if (
                        target.roomId
                    ) {

                        removeUserFromRoom(
                            target
                        );
                    }

                    safeSend(
                        target.ws,
                        {
                            type:
                                "force-lobby"
                        }
                    );

                    sendUserList();

                    return;
                }

                /* =================================================
                   ADMIN DELETE ROOM
                ================================================= */

                if (
                    message.type ===
                    "admin-delete-room"
                ) {

                    const roomId =
                        String(
                            message.roomId ||
                            ""
                        );

                    const room =
                        rooms.get(
                            roomId
                        );

                    if (!room)
                        return;

                    if (
                        room.permanent
                    ) {

                        safeSend(
                            ws,
                            {
                                type:
                                    "admin-error",

                                message:
                                    "Impossible de supprimer ce salon."
                            }
                        );

                        return;
                    }

                    for (
                        const userId
                        of room.users
                    ) {

                        const user =
                            users.get(
                                userId
                            );

                        if (!user)
                            continue;

                        user.roomId =
                            null;

                        user.microphoneEnabled =
                            false;

                        user.cameraEnabled =
                            false;

                        safeSend(
                            user.ws,
                            {
                                type:
                                    "room-deleted",

                                roomId
                            }
                        );
                    }

                    rooms.delete(
                        roomId
                    );

                    sendRoomList();
                    sendUserList();

                    return;
                }

                /* =================================================
                   ADMIN REFRESH
                ================================================= */

                if (
                    message.type ===
                    "admin-refresh"
                ) {

                    const roomList = [];

                    for (
                        const room
                        of rooms.values()
                    ) {

                        roomList.push(
                            publicRoom(room)
                        );
                    }

                    const userList = [];

                    for (
                        const user
                        of users.values()
                    ) {

                        userList.push(
                            publicUser(user)
                        );
                    }

                    safeSend(
                        ws,
                        {
                            type:
                                "admin-data",

                            rooms:
                                roomList,

                            users:
                                userList
                        }
                    );

                    return;
                }
            }
        );

        /* ========================================================
           DISCONNECT
        ======================================================== */

        ws.on(
            "close",
            () => {

                if (!currentUser)
                    return;

                console.log(
                    `${currentUser.username} disconnected temporarily`
                );

                if (
                    currentUser.ws ===
                    ws
                ) {

                    currentUser.ws =
                        null;
                }

                /*
                 * On conserve l'utilisateur et son salon
                 * pendant la durée de la session.
                 *
                 * Cela permet un refresh de la page
                 * sans perdre immédiatement la session.
                 */
            }
        );
    }
);

/* ============================================================
   CLEANUP SESSIONS
============================================================ */

setInterval(
    () => {

        const now =
            Date.now();

        for (
            const [
                token,
                session
            ]
            of sessions
        ) {

            if (
                now -
                session.createdAt >
                1000 *
                60 *
                60 *
                24 *
                30
            ) {

                sessions.delete(
                    token
                );

                const user =
                    users.get(
                        session.userId
                    );

                if (!user)
                    continue;

                if (
                    !user.ws &&
                    user.roomId
                ) {

                    removeUserFromRoom(
                        user
                    );
                }

                if (!user.ws) {

                    users.delete(
                        user.id
                    );

                    sendUserList();
                    sendRoomList();
                }
            }
        }

    },
    1000 *
    60 *
    60
);

/* ============================================================
   START
============================================================ */

server.listen(
    PORT,
    () => {

        console.log(
            `Col'inCall server running on port ${PORT}`
        );
    }
);
