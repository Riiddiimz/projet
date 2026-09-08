const http = require("http");
const WebSocket = require("ws");
const crypto = require("crypto");

const PORT =
    process.env.PORT || 10000;


/* =========================================================
   ADMIN
========================================================= */

const ADMIN_USERNAME =
    "Riddimz";

const ADMIN_CODE =
    "85206";


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
                        "Col'inCall Server"

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

const rooms =
    new Map();


/* =========================================================
   USERS
========================================================= */

const clients =
    new Map();


/* =========================================================
   CREATE DEFAULT ROOM
========================================================= */

function createRoom(
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

            max:
                8,

            users:
                new Map()

        }
    );

}


createRoom(
    "general",
    "Général",
    "Discussion générale",
    "💬"
);

createRoom(
    "gaming",
    "Gaming",
    "Parlez jeux vidéo",
    "🎮"
);

createRoom(
    "chill",
    "Chill",
    "Venez simplement discuter",
    "☕"
);

createRoom(
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

    if(
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

    return Array
        .from(
            rooms.values()
        )
        .map(
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
   USERS LIST
========================================================= */

function getUsersList() {

    return Array
        .from(
            clients.entries()
        )
        .map(
            ([id, client]) => ({

                id,

                name:
                    client.name,

                admin:
                    client.admin,

                avatar:
                    client.avatar || "",

                description:
                    client.description || "",

                room:
                    client.room || null,

                roomName:
                    client.room
                        ? rooms.get(
                            client.room
                        )?.name || ""
                        : ""

            })
        );

}


/* =========================================================
   UPDATE LOBBY
========================================================= */

function broadcastLobby() {

    const data = {

        type:
            "room-updated",

        rooms:
            getRoomList()

    };


    wss.clients.forEach(
        client => {

            if(
                client.authenticated
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
   AUTHENTICATION
========================================================= */

function login(
    ws,
    data
) {

    const name =
        String(
            data.name || ""
        ).trim();


    const wantsAdmin =
        Boolean(
            data.admin
        );


    if(!name) {

        send(
            ws,
            {

                type:
                    "login-result",

                success:
                    false,

                message:
                    "Pseudo obligatoire."

            }
        );

        return;

    }


    /*
        ADMIN
    */

    if(wantsAdmin) {

        if(
            name !==
                ADMIN_USERNAME ||
            String(
                data.code || ""
            ) !==
                ADMIN_CODE
        ) {

            send(
                ws,
                {

                    type:
                        "login-result",

                    success:
                        false,

                    message:
                        "Pseudo ou code administrateur incorrect."

                }
            );

            return;

        }

    }


    const id =
        generateId();


    ws.id =
        id;

    ws.name =
        name;

    ws.admin =
        wantsAdmin;

    ws.authenticated =
        true;

    ws.room =
        null;

    ws.avatar =
        "";

    ws.description =
        "";


    clients.set(
        id,
        ws
    );


    send(
        ws,
        {

            type:
                "login-result",

            success:
                true,

            admin:
                wantsAdmin,

            id

        }
    );


    console.log(
        `[LOGIN] ${name} ${wantsAdmin ? "(ADMIN)" : ""}`
    );

}


/* =========================================================
   JOIN ROOM
========================================================= */

function joinRoom(
    ws,
    roomId,
    profile
) {

    if(!ws.authenticated)
        return;


    const room =
        rooms.get(
            roomId
        );


    if(!room) {

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


    if(
        room.users.size >=
            room.max
    ) {

        send(
            ws,
            {

                type:
                    "error",

                message:
                    "Salon complet."

            }
        );

        return;

    }


    if(ws.room) {

        leaveRoom(
            ws
        );

    }


    /*
        Profil
    */

    if(profile) {

        ws.avatar =
            String(
                profile.avatar || ""
            ).slice(
                0,
                500000
            );

        ws.description =
            String(
                profile.description || ""
            ).slice(
                0,
                160
            );

    }


    const existing =
        Array
            .from(
                room.users.entries()
            )
            .map(
                ([id, user]) => ({

                    id,

                    name:
                        user.name,

                    avatar:
                        user.avatar || "",

                    description:
                        user.description || ""

                })
            );


    room.users.set(
        ws.id,
        ws
    );


    ws.room =
        room.id;


    /*
        Nouveau participant
    */

    send(
        ws,
        {

            type:
                "joined-room",

            id:
                ws.id,

            roomName:
                room.name,

            count:
                room.users.size,

            users:
                existing

        }
    );


    /*
        Prévenir les autres
    */

    room.users.forEach(
        (user, id) => {

            if(
                id ===
                    ws.id
            ) {
                return;
            }


            send(
                user,
                {

                    type:
                        "user-joined",

                    id:
                        ws.id,

                    name:
                        ws.name,

                    avatar:
                        ws.avatar,

                    description:
                        ws.description,

                    count:
                        room.users.size

                }
            );

        }
    );


    broadcastLobby();


    console.log(
        `[ROOM] ${ws.name} -> ${room.name}`
    );

}


/* =========================================================
   LEAVE ROOM
========================================================= */

function leaveRoom(
    ws
) {

    if(!ws.room)
        return;


    const room =
        rooms.get(
            ws.room
        );


    if(!room) {

        ws.room =
            null;

        return;

    }


    const id =
        ws.id;


    room.users.delete(
        id
    );


    room.users.forEach(
        user => {

            send(
                user,
                {

                    type:
                        "user-left",

                    id,

                    count:
                        room.users.size

                }
            );

        }
    );


    ws.room =
        null;


    broadcastLobby();

}


/* =========================================================
   FORWARD WEBRTC
========================================================= */

function forward(
    ws,
    target,
    data
) {

    if(!ws.room)
        return;


    const room =
        rooms.get(
            ws.room
        );


    if(!room)
        return;


    const user =
        room.users.get(
            target
        );


    if(!user)
        return;


    send(
        user,
        {

            ...data,

            sender:
                ws.id,

            senderName:
                ws.name,

            senderAvatar:
                ws.avatar,

            senderDescription:
                ws.description

        }
    );

}


/* =========================================================
   CHAT
========================================================= */

function chat(
    ws,
    message
) {

    if(!ws.room)
        return;


    const room =
        rooms.get(
            ws.room
        );


    if(!room)
        return;


    const text =
        String(
            message || ""
        )
        .trim()
        .slice(
            0,
            500
        );


    if(!text)
        return;


    room.users.forEach(
        user => {

            if(
                user.id !==
                    ws.id
            ) {

                send(
                    user,
                    {

                        type:
                            "chat",

                        name:
                            ws.name,

                        message:
                            text,

                        timestamp:
                            Date.now()

                    }
                );

            }

        }
    );

}


/* =========================================================
   CREATE ROOM
========================================================= */

function createNewRoom(
    ws,
    name,
    description,
    icon
) {

    if(!ws.authenticated)
        return;


    const cleanName =
        String(
            name || ""
        )
        .trim()
        .slice(
            0,
            30
        );


    if(!cleanName)
        return;


    let id =
        cleanName
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


    if(!id) {

        id =
            "room-" +
            generateId();

    }


    const original =
        id;

    let i =
        2;


    while(
        rooms.has(id)
    ) {

        id =
            original +
            "-" +
            i++;

    }


    createRoom(
        id,
        cleanName,
        String(
            description || ""
        ).slice(0,80),
        icon || "💬"
    );


    send(
        ws,
        {

            type:
                "room-created",

            room:
                id

        }
    );


    broadcastLobby();

}


/* =========================================================
   ADMIN CHECK
========================================================= */

function requireAdmin(
    ws
) {

    return (
        ws &&
        ws.authenticated &&
        ws.admin === true
    );

}


/* =========================================================
   ADMIN DELETE ROOM
========================================================= */

function adminDeleteRoom(
    ws,
    roomId
) {

    if(!requireAdmin(ws))
        return;


    const room =
        rooms.get(
            roomId
        );


    if(!room)
        return;


    /*
        Expulser les utilisateurs
    */

    room.users.forEach(
        user => {

            send(
                user,
                {

                    type:
                        "kicked",

                    reason:
                        "Le salon a été supprimé par l'administrateur."

                }
            );


            user.room =
                null;

        }
    );


    rooms.delete(
        roomId
    );


    broadcastLobby();

}


/* =========================================================
   ADMIN KICK
========================================================= */

function adminKick(
    ws,
    targetId
) {

    if(!requireAdmin(ws))
        return;


    const target =
        clients.get(
            targetId
        );


    if(!target)
        return;


    /*
        Ne pas permettre de kick l'admin
    */

    if(target.admin)
        return;


    if(target.room) {

        const room =
            rooms.get(
                target.room
            );


        if(room) {

            room.users.delete(
                target.id
            );


            room.users.forEach(
                user => {

                    send(
                        user,
                        {

                            type:
                                "user-left",

                            id:
                                target.id,

                            count:
                                room.users.size

                        }
                    );

                }
            );

        }

    }


    target.room =
        null;


    send(
        target,
        {

            type:
                "kicked",

            reason:
                "Vous avez été expulsé par l'administrateur."

        }
    );


    broadcastLobby();

}


/* =========================================================
   ADMIN MUTE / CAMERA
========================================================= */

function adminMediaAction(
    ws,
    targetId,
    type,
    enabled
) {

    if(!requireAdmin(ws))
        return;


    const target =
        clients.get(
            targetId
        );


    if(!target)
        return;


    if(target.admin)
        return;


    send(
        target,
        {

            type:
                type,

            enabled:
                enabled !== false

        }
    );

}


/* =========================================================
   CONNECTION
========================================================= */

wss.on(
    "connection",
    ws => {

        ws.authenticated =
            false;

        ws.admin =
            false;

        ws.id =
            null;

        ws.name =
            null;

        ws.room =
            null;


        ws.on(
            "message",
            raw => {

                try {

                    const data =
                        JSON.parse(
                            raw.toString()
                        );


                    switch(
                        data.type
                    ) {


                        case "login":

                            login(
                                ws,
                                data
                            );

                            break;


                        case "get-rooms":

                            if(
                                ws.authenticated
                            ) {

                                send(
                                    ws,
                                    {

                                        type:
                                            "rooms",

                                        rooms:
                                            getRoomList()

                                    }
                                );

                            }

                            break;


                        case "get-users":

                            if(
                                requireAdmin(ws)
                            ) {

                                send(
                                    ws,
                                    {

                                        type:
                                            "admin-users",

                                        users:
                                            getUsersList()

                                    }
                                );

                            }

                            break;


                        case "create-room":

                            createNewRoom(

                                ws,

                                data.name,

                                data.description,

                                data.icon

                            );

                            break;


                        case "join-room":

                            joinRoom(

                                ws,

                                data.room,

                                data.profile

                            );

                            break;


                        case "offer":

                            forward(
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


                        case "answer":

                            forward(
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


                        case "ice-candidate":

                            forward(
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


                        case "chat":

                            chat(
                                ws,
                                data.message
                            );

                            break;


                        case "profile-update":

                            if(
                                ws.authenticated
                            ) {

                                if(
                                    data.profile
                                ) {

                                    ws.avatar =
                                        String(
                                            data.profile.avatar || ""
                                        ).slice(
                                            0,
                                            500000
                                        );

                                    ws.description =
                                        String(
                                            data.profile.description || ""
                                        ).slice(
                                            0,
                                            160
                                        );

                                }

                            }

                            break;


                        case "admin-delete-room":

                            adminDeleteRoom(
                                ws,
                                data.room
                            );

                            break;


                        case "admin-kick":

                            adminKick(
                                ws,
                                data.target
                            );

                            break;


                        case "admin-mute":

                            adminMediaAction(
                                ws,
                                data.target,
                                "admin-mute",
                                data.enabled
                            );

                            break;


                        case "admin-camera":

                            adminMediaAction(
                                ws,
                                data.target,
                                "admin-camera",
                                data.enabled
                            );

                            break;


                        case "leave":

                            leaveRoom(
                                ws
                            );

                            break;

                    }

                } catch(error) {

                    console.error(
                        "[MESSAGE ERROR]",
                        error
                    );

                }

            }
        );


        ws.on(
            "close",
            () => {

                leaveRoom(
                    ws
                );


                if(ws.id) {

                    clients.delete(
                        ws.id
                    );

                }

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
            `Col'inCall server started on port ${PORT}`
        );

    }
);
