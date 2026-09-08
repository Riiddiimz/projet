const http = require("http");
const WebSocket = require("ws");
const crypto = require("crypto");

const PORT =
    process.env.PORT || 10000;


/* =========================================================
   HTTP
========================================================= */

const server =
    http.createServer(
        (req, res) => {

            res.writeHead(
                200,
                {
                    "Content-Type":
                        "application/json",
                    "Access-Control-Allow-Origin":
                        "*"
                }
            );


            res.end(
                JSON.stringify({
                    status:
                        "online",

                    service:
                        "Col'inCall WebRTC Server"
                })
            );

        }
    );


/* =========================================================
   WEBSOCKET
========================================================= */

const wss =
    new WebSocket.Server({
        server
    });


/* =========================================================
   ROOMS
========================================================= */

/*
    Chaque salon :

    {
        id,
        name,
        description,
        icon,
        max,
        users: Map()
    }
*/

const rooms =
    new Map();


/* =========================================================
   DEFAULT ROOMS
========================================================= */

function createDefaultRoom(
    id,
    name,
    description,
    icon
) {

    rooms.set(
        id,
        {

            id,

            name,

            description,

            icon,

            max: 8,

            users:
                new Map()

        }
    );

}


createDefaultRoom(
    "general",
    "Général",
    "Discussion générale",
    "💬"
);

createDefaultRoom(
    "gaming",
    "Gaming",
    "Parlez jeux vidéo",
    "🎮"
);

createDefaultRoom(
    "chill",
    "Chill",
    "Venez simplement discuter",
    "☕"
);

createDefaultRoom(
    "musique",
    "Musique",
    "Partagez vos découvertes",
    "🎵"
);


/* =========================================================
   UTILS
========================================================= */

function generateId() {

    return crypto
        .randomBytes(8)
        .toString("hex");

}


function send(
    ws,
    data
) {

    if (
        ws &&
        ws.readyState ===
            WebSocket.OPEN
    ) {

        ws.send(
            JSON.stringify(
                data
            )
        );

    }

}


/* =========================================================
   ROOM LIST
========================================================= */

function getRoomList() {

    return Array.from(
        rooms.values()
    ).map(
        room => ({

            id:
                room.id,

            name:
                room.name,

            description:
                room.description,

            icon:
                room.icon,

            count:
                room.users.size,

            max:
                room.max

        })
    );

}


/* =========================================================
   BROADCAST ALL
========================================================= */

function broadcastAll(
    data,
    except = null
) {

    wss.clients.forEach(
        client => {

            if (
                client !== except
            ) {

                send(
                    client,
                    data
                );

            }

        }
    );

}


/* =========================================================
   UPDATE ROOM LIST
========================================================= */

function updateLobby() {

    broadcastAll({

        type:
            "room-updated",

        rooms:
            getRoomList()

    });

}


/* =========================================================
   CREATE ROOM
========================================================= */

function createRoom(
    ws,
    name,
    description,
    icon
) {

    let id =
        name
            .toLowerCase()
            .normalize("NFD")
            .replace(
                /[\u0300-\u036f]/g,
                ""
            )
            .replace(
                /[^a-z0-9]+/g,
                "-"
            )
            .replace(
                /^-+|-+$/g,
                ""
            );


    if (!id) {

        id =
            "room-" +
            generateId();

    }


    const originalId =
        id;


    let number =
        2;


    while (
        rooms.has(id)
    ) {

        id =
            originalId +
            "-" +
            number;

        number++;

    }


    rooms.set(
        id,
        {

            id,

            name:
                name.slice(0,30),

            description:
                (
                    description ||
                    "Salon Col'inCall"
                ).slice(0,80),

            icon:
                icon ||
                "💬",

            max:
                8,

            users:
                new Map()

        }
    );


    send(
        ws,
        {

            type:
                "room-created",

            room:
                {

                    id

                }

        }
    );


    updateLobby();

}


/* =========================================================
   JOIN
========================================================= */

function joinRoom(
    ws,
    roomId,
    name
) {

    const room =
        rooms.get(
            roomId
        );


    if (!room) {

        send(
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
        room.users.size >=
        room.max
    ) {

        send(
            ws,
            {

                type:
                    "error",

                message:
                    "Ce salon est complet."

            }
        );

        return;

    }


    /*
        Si déjà dans un autre salon
    */

    if (ws.room) {

        leaveRoom(
            ws
        );

    }


    const id =
        generateId();


    /*
        Utilisateurs déjà présents
    */

    const existingUsers =
        Array.from(
            room.users.entries()
        ).map(
            ([userId, user]) => ({

                id:
                    userId,

                name:
                    user.name

            })
        );


    room.users.set(
        id,
        {

            ws,

            name:
                name ||
                "Participant"

        }
    );


    ws.id =
        id;

    ws.room =
        roomId;

    ws.name =
        name ||
        "Participant";


    /*
        Réponse au nouveau client
    */

    send(
        ws,
        {

            type:
                "joined-room",

            id,

            roomName:
                room.name,

            users:
                existingUsers,

            count:
                room.users.size

        }
    );


    /*
        Prévenir les autres
    */

    room.users.forEach(
        (user, userId) => {

            if (
                userId !== id
            ) {

                send(
                    user.ws,
                    {

                        type:
                            "user-joined",

                        id,

                        name:
                            ws.name,

                        count:
                            room.users.size

                    }
                );

            }

        }
    );


    updateLobby();


    console.log(
        `[JOIN] ${ws.name} -> ${room.name}`
    );

}


/* =========================================================
   LEAVE
========================================================= */

function leaveRoom(
    ws
) {

    if (
        !ws.room ||
        !ws.id
    ) {

        return;

    }


    const room =
        rooms.get(
            ws.room
        );


    if (!room) {

        ws.room =
            null;

        ws.id =
            null;

        return;

    }


    const leavingId =
        ws.id;


    room.users.delete(
        leavingId
    );


    /*
        Prévenir les autres
    */

    room.users.forEach(
        user => {

            send(
                user.ws,
                {

                    type:
                        "user-left",

                    id:
                        leavingId,

                    count:
                        room.users.size

                }
            );

        }
    );


    console.log(
        `[LEAVE] ${ws.name} -> ${room.name}`
    );


    ws.room =
        null;

    ws.id =
        null;

    ws.name =
        null;


    updateLobby();

}


/* =========================================================
   FORWARD WEBRTC
========================================================= */

function forwardToPeer(
    ws,
    targetId,
    data
) {

    if (!ws.room) {
        return;
    }


    const room =
        rooms.get(
            ws.room
        );


    if (!room) {
        return;
    }


    const target =
        room.users.get(
            targetId
        );


    if (!target) {
        return;
    }


    send(
        target.ws,
        {

            ...data,

            sender:
                ws.id,

            senderName:
                ws.name

        }
    );

}


/* =========================================================
   CHAT
========================================================= */

function handleChat(
    ws,
    message
) {

    if (!ws.room) {
        return;
    }


    if (
        typeof message !==
        "string"
    ) {

        return;

    }


    const clean =
        message
            .trim()
            .slice(0,500);


    if (!clean) {
        return;
    }


    const room =
        rooms.get(
            ws.room
        );


    if (!room) {
        return;
    }


    /*
        Envoyer à tous les autres.
        L'expéditeur affiche lui-même
        son message côté navigateur.
    */

    room.users.forEach(
        (user, userId) => {

            if (
                userId !== ws.id
            ) {

                send(
                    user.ws,
                    {

                        type:
                            "chat",

                        name:
                            ws.name,

                        message:
                            clean,

                        timestamp:
                            Date.now()

                    }
                );

            }

        }
    );

}


/* =========================================================
   CONNECTION
========================================================= */

wss.on(
    "connection",
    ws => {

        console.log(
            "[WS] Client connecté"
        );


        ws.id =
            null;

        ws.room =
            null;

        ws.name =
            null;


        ws.on(
            "message",
            raw => {

                try {

                    const data =
                        JSON.parse(
                            raw.toString()
                        );


                    switch (
                        data.type
                    ) {


                        /* =========================
                           GET ROOMS
                        ========================= */

                        case "get-rooms":

                            send(
                                ws,
                                {

                                    type:
                                        "rooms",

                                    rooms:
                                        getRoomList()

                                }
                            );

                            break;


                        /* =========================
                           CREATE ROOM
                        ========================= */

                        case "create-room":

                            createRoom(

                                ws,

                                String(
                                    data.name ||
                                    "Nouveau salon"
                                ).trim(),

                                String(
                                    data.description ||
                                    ""
                                ).trim(),

                                data.icon ||
                                "💬"

                            );

                            break;


                        /* =========================
                           JOIN
                        ========================= */

                        case "join-room":

                            joinRoom(

                                ws,

                                data.room ||
                                    "general",

                                String(
                                    data.name ||
                                    "Participant"
                                ).trim()

                            );

                            break;


                        /* =========================
                           OFFER
                        ========================= */

                        case "offer":

                            forwardToPeer(

                                ws,

                                data.target,

                                {

                                    type:
                                        "offer",

                                    offer:
                                        data.offer

                                }

                            );

                            break;


                        /* =========================
                           ANSWER
                        ========================= */

                        case "answer":

                            forwardToPeer(

                                ws,

                                data.target,

                                {

                                    type:
                                        "answer",

                                    answer:
                                        data.answer

                                }

                            );

                            break;


                        /* =========================
                           ICE
                        ========================= */

                        case "ice-candidate":

                            forwardToPeer(

                                ws,

                                data.target,

                                {

                                    type:
                                        "ice-candidate",

                                    candidate:
                                        data.candidate

                                }

                            );

                            break;


                        /* =========================
                           CHAT
                        ========================= */

                        case "chat":

                            handleChat(

                                ws,

                                data.message

                            );

                            break;


                        /* =========================
                           LEAVE
                        ========================= */

                        case "leave":

                            leaveRoom(
                                ws
                            );

                            break;

                    }


                } catch (error) {

                    console.error(
                        "[WS ERROR]",
                        error
                    );

                }

            }
        );


        /* =========================
           CLOSE
        ========================= */

        ws.on(
            "close",
            () => {

                leaveRoom(
                    ws
                );

            }
        );


        ws.on(
            "error",
            error => {

                console.error(
                    "[WS ERROR]",
                    error
                );

            }
        );

    }
);


/* =========================================================
   START
========================================================= */

server.listen(
    PORT,
    () => {

        console.log(
            `Col'inCall server running on port ${PORT}`
        );

    }
);
