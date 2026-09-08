const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;

const ADMIN_USERNAME = "Riddimz";
const ADMIN_CODE = "85206";

const server = http.createServer((req, res) => {

    if (req.url === "/health") {

        res.writeHead(200, {
            "Content-Type": "application/json"
        });

        res.end(JSON.stringify({
            status: "ok",
            service: "Col'inCall"
        }));

        return;
    }

    if (req.url === "/" || req.url === "/index.html") {

        const filePath = path.join(__dirname, "index.html");

        fs.readFile(filePath, (err, data) => {

            if (err) {

                res.writeHead(500);
                res.end("Erreur lors du chargement de index.html");

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
    res.end("Not Found");
});


const wss = new WebSocket.Server({
    server
});


const users = new Map();
const rooms = new Map();


rooms.set("general", {

    id: "general",
    name: "Général",
    description: "Discussion générale de Col'inCall",
    ownerId: null,
    participants: new Set()
});


function createId(prefix = "") {

    return (
        prefix +
        Math.random().toString(36).substring(2, 10) +
        Date.now().toString(36)
    );
}


function safeSend(ws, data) {

    if (
        ws &&
        ws.readyState === WebSocket.OPEN
    ) {

        ws.send(JSON.stringify(data));
    }
}


function publicUser(user) {

    return {

        id: user.id,
        username: user.username,
        role: user.role,
        description: user.description || "",
        roomId: user.roomId || null,
        microphoneEnabled: !!user.microphoneEnabled,
        cameraEnabled: !!user.cameraEnabled
    };
}


function publicRoom(room) {

    return {

        id: room.id,
        name: room.name,
        description: room.description || "",
        count: room.participants.size,
        ownerId: room.ownerId || null
    };
}


function broadcastAll(data) {

    users.forEach(user => {

        safeSend(user.ws, data);

    });
}


function broadcastRoom(room, data, exceptUserId = null) {

    if (!room)
        return;

    room.participants.forEach(userId => {

        if (
            exceptUserId &&
            userId === exceptUserId
        ) {
            return;
        }

        const user = users.get(userId);

        if (user) {
            safeSend(user.ws, data);
        }

    });
}


function broadcastLobby(data) {

    users.forEach(user => {

        if (!user.roomId) {
            safeSend(user.ws, data);
        }

    });
}


function sendRoomList() {

    broadcastAll({

        type: "rooms-list",

        rooms:
            Array.from(rooms.values())
                .map(publicRoom)

    });
}


function sendUsersList() {

    broadcastAll({

        type: "users-list",

        users:
            Array.from(users.values())
                .map(publicUser)

    });
}


function broadcastUserUpdate(user) {

    broadcastAll({

        type: "user-updated",

        user:
            publicUser(user)

    });
}


/* =========================
   LOGIN
========================= */

function handleLogin(ws, message) {

    const username =
        String(message.username || "").trim();

    const role =
        message.role === "admin"
            ? "admin"
            : "user";


    if (!username) {

        safeSend(ws, {

            type: "login-error",

            message:
                "Nom d'utilisateur obligatoire."

        });

        return;
    }


    if (
        role === "admin" &&
        (
            username !== ADMIN_USERNAME ||
            String(message.code || "") !== ADMIN_CODE
        )
    ) {

        safeSend(ws, {

            type: "login-error",

            message:
                "Identifiants administrateur incorrects."

        });

        return;
    }


    const alreadyExists =
        Array.from(users.values()).some(
            user =>
                user.username.toLowerCase() ===
                username.toLowerCase()
        );


    if (alreadyExists) {

        safeSend(ws, {

            type: "login-error",

            message:
                "Ce nom d'utilisateur est déjà utilisé."

        });

        return;
    }


    const user = {

        id: createId("user_"),

        username,

        role,

        description: "",

        roomId: null,

        microphoneEnabled: false,

        cameraEnabled: false,

        ws
    };


    users.set(
        user.id,
        user
    );


    ws.userId =
        user.id;


    safeSend(ws, {

        type: "login-success",

        user:
            publicUser(user)

    });


    sendRoomList();
    sendUsersList();
}


/* =========================
   CREATE ROOM
========================= */

function createRoom(user, message) {

    const name =
        String(message.name || "").trim();

    const description =
        String(message.description || "").trim();


    if (!name) {

        safeSend(user.ws, {

            type: "error",

            message:
                "Le nom du salon est obligatoire."

        });

        return;
    }


    const room = {

        id: createId("room_"),

        name,

        description,

        ownerId:
            user.id,

        participants:
            new Set()

    };


    rooms.set(
        room.id,
        room
    );


    safeSend(user.ws, {

        type: "room-created",

        room:
            publicRoom(room)

    });


    sendRoomList();
}


/* =========================
   JOIN ROOM
========================= */

function joinRoom(user, roomId) {

    const room =
        rooms.get(roomId);


    if (!room) {

        safeSend(user.ws, {

            type: "error",

            message:
                "Ce salon n'existe plus."

        });

        return;
    }


    if (user.roomId) {

        leaveRoom(
            user,
            false
        );
    }


    const existingParticipantIds =
        Array.from(room.participants);


    room.participants.add(
        user.id
    );


    user.roomId =
        room.id;


    const participants =
        existingParticipantIds
            .map(id => users.get(id))
            .filter(Boolean)
            .map(publicUser);


    safeSend(user.ws, {

        type: "room-joined",

        room:
            publicRoom(room),

        participants

    });


    broadcastRoom(
        room,
        {

            type: "user-joined",

            user:
                publicUser(user)

        },
        user.id
    );


    sendRoomList();
    sendUsersList();
}


/* =========================
   LEAVE
========================= */

function leaveRoom(user, sendConfirmation = true) {

    if (!user.roomId)
        return;


    const room =
        rooms.get(user.roomId);


    const oldRoomId =
        user.roomId;


    if (room) {

        room.participants.delete(
            user.id
        );


        broadcastRoom(
            room,
            {

                type: "user-left",

                userId:
                    user.id

            },
            user.id
        );


        if (
            room.id !== "general" &&
            room.participants.size === 0
        ) {

            rooms.delete(
                room.id
            );
        }
    }


    user.roomId = null;

    user.microphoneEnabled = false;

    user.cameraEnabled = false;


    if (sendConfirmation) {

        safeSend(user.ws, {

            type: "room-left",

            roomId:
                oldRoomId

        });
    }


    sendRoomList();
    sendUsersList();
}


/* =========================
   CHAT
========================= */

function handleChat(user, message) {

    const text =
        String(message.text || "").trim();


    if (!text)
        return;


    if (!user.roomId) {

        broadcastLobby({

            type: "chat-message",

            roomId: null,

            userId:
                user.id,

            username:
                user.username,

            text

        });

        return;
    }


    const room =
        rooms.get(user.roomId);


    if (!room)
        return;


    broadcastRoom(
        room,
        {

            type: "chat-message",

            roomId:
                room.id,

            userId:
                user.id,

            username:
                user.username,

            text

        }
    );
}


/* =========================
   PROFILE
========================= */

function updateProfile(user, message) {

    user.description =
        String(
            message.description || ""
        )
        .trim()
        .substring(0, 500);


    safeSend(user.ws, {

        type: "profile-updated",

        user:
            publicUser(user)

    });


    broadcastUserUpdate(user);

    sendUsersList();
}


/* =========================
   WEBRTC
========================= */

function relayToTarget(
    user,
    message,
    payloadKey
) {

    const targetId =
        message.target;


    if (!targetId)
        return;


    const target =
        users.get(targetId);


    if (!target)
        return;


    if (
        !user.roomId ||
        target.roomId !== user.roomId
    ) {

        return;
    }


    safeSend(
        target.ws,
        {

            type:
                message.type,

            from:
                user.id,

            [payloadKey]:
                message[payloadKey]

        }
    );
}


/* =========================
   MEDIA STATE
========================= */

function updateMediaState(user, message) {

    user.microphoneEnabled =
        !!message.microphoneEnabled;

    user.cameraEnabled =
        !!message.cameraEnabled;


    if (user.roomId) {

        const room =
            rooms.get(user.roomId);


        if (room) {

            broadcastRoom(
                room,
                {

                    type: "media-state",

                    userId:
                        user.id,

                    microphoneEnabled:
                        user.microphoneEnabled,

                    cameraEnabled:
                        user.cameraEnabled

                },
                user.id
            );
        }
    }


    sendUsersList();
}


/* =========================
   ADMIN MUTE
========================= */

function adminMute(admin, userId) {

    if (!isAdmin(admin))
        return;


    const target =
        users.get(userId);


    if (!target)
        return;


    target.microphoneEnabled =
        false;


    /*
        On force réellement le navigateur
        de la personne à couper son micro.
    */

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


    safeSend(
        target.ws,
        {

            type: "admin-action",

            message:
                "Votre microphone a été désactivé par l'administrateur."

        }
    );


    broadcastUserUpdate(target);


    if (target.roomId) {

        const room =
            rooms.get(target.roomId);


        if (room) {

            broadcastRoom(
                room,
                {

                    type: "media-state",

                    userId:
                        target.id,

                    microphoneEnabled:
                        false,

                    cameraEnabled:
                        target.cameraEnabled

                }
            );
        }
    }


    safeSend(admin.ws, {

        type: "admin-action",

        message:
            "Microphone désactivé."

    });


    sendUsersList();
}


/* =========================
   ADMIN CAMERA
========================= */

function adminCamera(admin, userId) {

    if (!isAdmin(admin))
        return;


    const target =
        users.get(userId);


    if (!target)
        return;


    target.cameraEnabled =
        false;


    /*
        Force la désactivation réelle
        de la caméra du navigateur ciblé.
    */

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


    safeSend(
        target.ws,
        {

            type: "admin-action",

            message:
                "Votre caméra a été désactivée par l'administrateur."

        }
    );


    broadcastUserUpdate(target);


    if (target.roomId) {

        const room =
            rooms.get(target.roomId);


        if (room) {

            broadcastRoom(
                room,
                {

                    type: "media-state",

                    userId:
                        target.id,

                    microphoneEnabled:
                        target.microphoneEnabled,

                    cameraEnabled:
                        false

                }
            );
        }
    }


    safeSend(admin.ws, {

        type: "admin-action",

        message:
            "Caméra désactivée."

    });


    sendUsersList();
}


/* =========================
   ADMIN KICK
========================= */

function adminKick(admin, userId) {

    if (!isAdmin(admin))
        return;


    const target =
        users.get(userId);


    if (!target)
        return;


    if (target.id === admin.id) {

        safeSend(admin.ws, {

            type: "error",

            message:
                "Vous ne pouvez pas vous expulser vous-même."

        });

        return;
    }


    safeSend(
        target.ws,
        {

            type: "kicked",

            message:
                "Vous avez été expulsé par l'administrateur."

        }
    );


    if (target.roomId) {

        leaveRoom(
            target,
            false
        );
    }


    safeSend(admin.ws, {

        type: "admin-action",

        message:
            "Utilisateur expulsé."

    });


    sendRoomList();
    sendUsersList();
}


/* =========================
   DELETE ROOM
========================= */

function adminDeleteRoom(admin, roomId) {

    if (!isAdmin(admin))
        return;


    if (roomId === "general") {

        safeSend(admin.ws, {

            type: "error",

            message:
                "Le salon Général ne peut pas être supprimé."

        });

        return;
    }


    const room =
        rooms.get(roomId);


    if (!room)
        return;


    const participantIds =
        Array.from(room.participants);


    participantIds.forEach(userId => {

        const user =
            users.get(userId);


        if (!user)
            return;


        safeSend(
            user.ws,
            {

                type: "room-left",

                roomId:
                    room.id,

                message:
                    "Le salon a été supprimé par l'administrateur."

            }
        );


        user.roomId = null;

        user.microphoneEnabled = false;

        user.cameraEnabled = false;

    });


    rooms.delete(roomId);


    safeSend(admin.ws, {

        type: "admin-action",

        message:
            "Salon supprimé."

    });


    sendRoomList();
    sendUsersList();
}


/* =========================
   ADMIN CHECK
========================= */

function isAdmin(user) {

    return (
        user &&
        user.role === "admin"
    );
}


/* =========================
   ROUTER
========================= */

function handleMessage(ws, message) {

    const user =
        ws.userId
            ? users.get(ws.userId)
            : null;


    if (message.type === "login") {

        handleLogin(
            ws,
            message
        );

        return;
    }


    if (!user) {

        safeSend(ws, {

            type: "error",

            message:
                "Vous devez être connecté."

        });

        return;
    }


    switch (message.type) {

        case "create-room":

            createRoom(
                user,
                message
            );

            break;


        case "join-room":

            joinRoom(
                user,
                message.roomId
            );

            break;


        case "leave-room":

            leaveRoom(
                user,
                true
            );

            break;


        case "chat":

            handleChat(
                user,
                message
            );

            break;


        case "update-profile":

            updateProfile(
                user,
                message
            );

            break;


        case "offer":

            relayToTarget(
                user,
                message,
                "offer"
            );

            break;


        case "answer":

            relayToTarget(
                user,
                message,
                "answer"
            );

            break;


        case "ice-candidate":

            relayToTarget(
                user,
                message,
                "candidate"
            );

            break;


        case "media-state":

            updateMediaState(
                user,
                message
            );

            break;


        case "admin-mute":

            adminMute(
                user,
                message.userId
            );

            break;


        case "admin-camera":

            adminCamera(
                user,
                message.userId
            );

            break;


        case "admin-kick":

            adminKick(
                user,
                message.userId
            );

            break;


        case "admin-delete-room":

            adminDeleteRoom(
                user,
                message.roomId
            );

            break;


        default:

            safeSend(user.ws, {

                type: "error",

                message:
                    "Commande inconnue."

            });
    }
}


/* =========================
   CONNECTION
========================= */

wss.on("connection", ws => {

    console.log(
        "Nouvelle connexion WebSocket"
    );


    ws.on("message", raw => {

        try {

            const message =
                JSON.parse(
                    raw.toString()
                );


            handleMessage(
                ws,
                message
            );

        } catch (error) {

            console.error(
                "Message error:",
                error
            );


            safeSend(
                ws,
                {

                    type: "error",

                    message:
                        "Message invalide."

                }
            );
        }
    });


    ws.on("close", () => {

        const userId =
            ws.userId;


        if (!userId)
            return;


        const user =
            users.get(userId);


        if (!user)
            return;


        console.log(
            "Déconnexion:",
            user.username
        );


        if (user.roomId) {

            leaveRoom(
                user,
                false
            );
        }


        users.delete(
            userId
        );


        sendRoomList();
        sendUsersList();
    });


    ws.on("error", error => {

        console.error(
            "WebSocket error:",
            error
        );

    });
});


server.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            `Col'inCall server listening on port ${PORT}`
        );

    }
);
