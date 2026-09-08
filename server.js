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
    name: "Salon général",
    ownerId: null,
    users: new Set(),
    createdAt: Date.now()
});

function generateId(prefix = "") {
    return prefix + crypto.randomBytes(8).toString("hex");
}

function send(ws, type, data = {}) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    ws.send(
        JSON.stringify({
            type,
            ...data
        })
    );
}

function broadcast(type, data = {}, exceptId = null) {
    for (const user of users.values()) {
        if (user.id === exceptId) continue;
        send(user.ws, type, data);
    }
}

function broadcastRoom(roomId, type, data = {}, exceptId = null) {
    const room = rooms.get(roomId);
    if (!room) return;

    for (const userId of room.users) {
        if (userId === exceptId) continue;

        const user = users.get(userId);
        if (user) {
            send(user.ws, type, data);
        }
    }
}

function getPublicUser(user) {
    return {
        id: user.id,
        username: user.username,
        avatar: user.avatar || null,
        muted: !!user.muted,
        cameraDisabled: !!user.cameraDisabled,
        isAdmin: !!user.isAdmin
    };
}

function getRoomList() {
    return Array.from(rooms.values()).map(room => ({
        id: room.id,
        name: room.name,
        ownerId: room.ownerId,
        userCount: room.users.size,
        isGeneral: room.id === GENERAL_ROOM_ID
    }));
}

function sendRoomList() {
    broadcast("room-list", {
        rooms: getRoomList()
    });
}

function getRoomParticipants(roomId) {
    const room = rooms.get(roomId);
    if (!room) return [];

    return Array.from(room.users)
        .map(id => users.get(id))
        .filter(Boolean)
        .map(getPublicUser);
}

function sendUsersListToAdmin(user) {
    if (!user.isAdmin) return;

    send(user.ws, "users-list", {
        users: Array.from(users.values()).map(getPublicUser)
    });
}

function removeUserFromRoom(user, notify = true) {
    if (!user.roomId) return;

    const room = rooms.get(user.roomId);

    if (room) {
        room.users.delete(user.id);

        if (notify) {
            broadcastRoom(
                room.id,
                "user-left",
                {
                    userId: user.id,
                    username: user.username
                },
                user.id
            );
        }

        // Ne jamais supprimer automatiquement le salon général.
        if (
            room.id !== GENERAL_ROOM_ID &&
            room.users.size === 0
        ) {
            rooms.delete(room.id);
        }
    }

    user.roomId = null;

    sendRoomList();
}

function createRoom(user, roomName) {
    const cleanName = String(roomName || "").trim();

    if (!cleanName) {
        send(user.ws, "error-message", {
            message: "Le nom du salon est obligatoire."
        });
        return;
    }

    if (cleanName.length > 50) {
        send(user.ws, "error-message", {
            message: "Le nom du salon est trop long."
        });
        return;
    }

    const roomId = generateId("room_");

    const room = {
        id: roomId,
        name: cleanName,
        ownerId: user.id,
        users: new Set(),
        createdAt: Date.now()
    };

    rooms.set(roomId, room);

    sendRoomList();

    joinRoom(user, roomId);
}

function joinRoom(user, roomId) {
    const room = rooms.get(roomId);

    if (!room) {
        send(user.ws, "error-message", {
            message: "Ce salon n'existe plus."
        });
        return;
    }

    if (user.roomId === roomId) {
        send(user.ws, "room-joined", {
            room: {
                id: room.id,
                name: room.name
            },
            participants: getRoomParticipants(room.id)
        });
        return;
    }

    if (user.roomId) {
        removeUserFromRoom(user);
    }

    const existingParticipants = getRoomParticipants(room.id);

    room.users.add(user.id);
    user.roomId = room.id;

    send(user.ws, "room-joined", {
        room: {
            id: room.id,
            name: room.name
        },
        participants: existingParticipants
    });

    // Prévenir les autres utilisateurs.
    broadcastRoom(
        room.id,
        "user-joined",
        {
            user: getPublicUser(user)
        },
        user.id
    );

    // Mettre à jour la liste de participants chez tout le monde.
    broadcastRoom(room.id, "users-list-room", {
        participants: getRoomParticipants(room.id)
    });

    sendRoomList();
}

function leaveRoom(user) {
    if (!user.roomId) {
        send(user.ws, "room-left", {});
        return;
    }

    const roomId = user.roomId;

    removeUserFromRoom(user, true);

    send(user.ws, "room-left", {
        roomId
    });
}

function deleteRoom(user, roomId) {
    if (!user.isAdmin) {
        send(user.ws, "error-message", {
            message: "Action réservée à l'administrateur."
        });
        return;
    }

    if (roomId === GENERAL_ROOM_ID) {
        send(user.ws, "error-message", {
            message: "Le salon général ne peut pas être supprimé."
        });
        return;
    }

    const room = rooms.get(roomId);

    if (!room) {
        send(user.ws, "error-message", {
            message: "Salon introuvable."
        });
        return;
    }

    for (const userId of room.users) {
        const roomUser = users.get(userId);

        if (!roomUser) continue;

        roomUser.roomId = null;

        send(roomUser.ws, "room-deleted", {
            roomId,
            message: "Le salon a été supprimé par l'administrateur."
        });
    }

    rooms.delete(roomId);

    sendRoomList();
}

function kickUser(admin, targetId) {
    if (!admin.isAdmin) {
        send(admin.ws, "error-message", {
            message: "Action réservée à l'administrateur."
        });
        return;
    }

    const target = users.get(targetId);

    if (!target) {
        send(admin.ws, "error-message", {
            message: "Utilisateur introuvable."
        });
        return;
    }

    if (target.id === admin.id) {
        send(admin.ws, "error-message", {
            message: "Vous ne pouvez pas vous expulser vous-même."
        });
        return;
    }

    if (target.roomId) {
        const room = rooms.get(target.roomId);

        if (room) {
            room.users.delete(target.id);

            broadcastRoom(
                room.id,
                "user-left",
                {
                    userId: target.id,
                    username: target.username
                },
                target.id
            );

            broadcastRoom(room.id, "users-list-room", {
                participants: getRoomParticipants(room.id)
            });
        }

        target.roomId = null;
    }

    send(target.ws, "kicked", {
        message: "Vous avez été expulsé par l'administrateur."
    });

    send(admin.ws, "error-message", {
        message: `${target.username} a été expulsé.`
    });

    sendRoomList();
    sendUsersListToAdmin(admin);
}

function setUserMute(admin, targetId, muted) {
    if (!admin.isAdmin) {
        send(admin.ws, "error-message", {
            message: "Action réservée à l'administrateur."
        });
        return;
    }

    const target = users.get(targetId);

    if (!target) {
        send(admin.ws, "error-message", {
            message: "Utilisateur introuvable."
        });
        return;
    }

    target.muted = !!muted;

    send(target.ws, "force-micro", {
        enabled: !target.muted
    });

    broadcastRoom(target.roomId, "user-updated", {
        user: getPublicUser(target)
    });

    sendUsersListToAdmin(admin);
}

function setUserCamera(admin, targetId, disabled) {
    if (!admin.isAdmin) {
        send(admin.ws, "error-message", {
            message: "Action réservée à l'administrateur."
        });
        return;
    }

    const target = users.get(targetId);

    if (!target) {
        send(admin.ws, "error-message", {
            message: "Utilisateur introuvable."
        });
        return;
    }

    target.cameraDisabled = !!disabled;

    send(target.ws, "force-camera", {
        enabled: !target.cameraDisabled
    });

    broadcastRoom(target.roomId, "user-updated", {
        user: getPublicUser(target)
    });

    sendUsersListToAdmin(admin);
}

function handleMessage(user, message) {
    if (!message || typeof message.type !== "string") return;

    switch (message.type) {

        case "login": {
            const username = String(message.username || "").trim();
            const code = String(message.code || "").trim();
            const isAdmin = !!message.isAdmin;

            if (!username) {
                send(user.ws, "login-error", {
                    message: "Veuillez entrer un pseudo."
                });
                return;
            }

            if (username.length > 30) {
                send(user.ws, "login-error", {
                    message: "Le pseudo est trop long."
                });
                return;
            }

            if (isAdmin) {
                if (
                    username !== ADMIN_USERNAME ||
                    code !== ADMIN_CODE
                ) {
                    send(user.ws, "login-error", {
                        message: "Identifiants administrateur incorrects."
                    });
                    return;
                }
            }

            user.username = username;
            user.isAdmin = isAdmin;
            user.loggedIn = true;

            send(user.ws, "login-success", {
                user: getPublicUser(user),
                rooms: getRoomList()
            });

            sendUsersListToAdmin(user);

            return;
        }

        case "update-profile": {
            if (!user.loggedIn) return;

            if (typeof message.avatar === "string") {
                if (message.avatar.length > 500000) {
                    send(user.ws, "error-message", {
                        message: "Avatar trop volumineux."
                    });
                    return;
                }

                user.avatar = message.avatar;
            }

            broadcastRoom(user.roomId, "user-updated", {
                user: getPublicUser(user)
            });

            send(user.ws, "profile-updated", {
                user: getPublicUser(user)
            });

            sendUsersListToAdmin(user);

            return;
        }

        case "create-room": {
            if (!user.loggedIn) return;

            createRoom(user, message.name);
            return;
        }

        case "join-room": {
            if (!user.loggedIn) return;

            joinRoom(user, String(message.roomId || ""));
            return;
        }

        case "leave-room": {
            if (!user.loggedIn) return;

            leaveRoom(user);
            return;
        }

        case "chat": {
            if (!user.loggedIn) return;

            const text = String(message.text || "").trim();

            if (!text) return;

            if (text.length > 500) {
                send(user.ws, "error-message", {
                    message: "Message trop long."
                });
                return;
            }

            const chatMessage = {
                id: generateId("msg_"),
                userId: user.id,
                username: user.username,
                avatar: user.avatar || null,
                text,
                timestamp: Date.now()
            };

            // Lobby : message global.
            if (!user.roomId) {
                broadcast("chat-message", {
                    message: chatMessage
                });
            } else {
                // Salon : message uniquement dans le salon.
                broadcastRoom(user.roomId, "chat-message", {
                    message: chatMessage
                });
            }

            return;
        }

        case "offer": {
            if (!user.loggedIn) return;

            const target = users.get(message.targetId);

            if (!target) return;

            send(target.ws, "offer", {
                fromId: user.id,
                fromUser: getPublicUser(user),
                offer: message.offer
            });

            return;
        }

        case "answer": {
            if (!user.loggedIn) return;

            const target = users.get(message.targetId);

            if (!target) return;

            send(target.ws, "answer", {
                fromId: user.id,
                answer: message.answer
            });

            return;
        }

        case "ice-candidate": {
            if (!user.loggedIn) return;

            const target = users.get(message.targetId);

            if (!target) return;

            send(target.ws, "ice-candidate", {
                fromId: user.id,
                candidate: message.candidate
            });

            return;
        }

        case "media-state": {
            if (!user.loggedIn) return;

            user.muted = !!message.muted;
            user.cameraDisabled = !!message.cameraDisabled;

            broadcastRoom(user.roomId, "user-updated", {
                user: getPublicUser(user)
            });

            if (user.isAdmin) {
                sendUsersListToAdmin(user);
            }

            return;
        }

        case "admin-kick":
            kickUser(user, message.targetId);
            return;

        case "admin-mute":
            setUserMute(
                user,
                message.targetId,
                !!message.muted
            );
            return;

        case "admin-camera":
            setUserCamera(
                user,
                message.targetId,
                !!message.disabled
            );
            return;

        case "admin-delete-room":
            deleteRoom(user, message.roomId);
            return;

        case "get-room-list":
            send(user.ws, "room-list", {
                rooms: getRoomList()
            });
            return;

        case "get-users":
            sendUsersListToAdmin(user);
            return;

        default:
            send(user.ws, "error-message", {
                message: `Commande inconnue : ${message.type}`
            });
    }
}

const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (
        url.pathname === "/" ||
        url.pathname === "/index.html"
    ) {
        const filePath = path.join(__dirname, "index.html");

        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(500, {
                    "Content-Type": "text/plain; charset=utf-8"
                });

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

    if (url.pathname === "/health") {
        res.writeHead(200, {
            "Content-Type": "application/json"
        });

        res.end(
            JSON.stringify({
                status: "online",
                service: "Col'inCall WebRTC Server"
            })
        );

        return;
    }

    res.writeHead(200, {
        "Content-Type": "application/json"
    });

    res.end(
        JSON.stringify({
            status: "online",
            service: "Col'inCall WebRTC Server"
        })
    );
});

const wss = new WebSocket.Server({
    server
});

wss.on("connection", ws => {
    const user = {
        id: generateId("user_"),
        ws,
        username: "Utilisateur",
        avatar: null,
        roomId: null,
        loggedIn: false,
        isAdmin: false,
        muted: true,
        cameraDisabled: true
    };

    users.set(user.id, user);

    send(ws, "connected", {
        userId: user.id
    });

    ws.on("message", raw => {
        try {
            const message = JSON.parse(raw.toString());
            handleMessage(user, message);
        } catch (error) {
            send(ws, "error-message", {
                message: "Message invalide."
            });
        }
    });

    ws.on("close", () => {
        if (user.roomId) {
            removeUserFromRoom(user, true);
        }

        users.delete(user.id);

        broadcast("user-updated", {
            userId: user.id,
            disconnected: true
        });

        sendRoomList();

        for (const admin of users.values()) {
            sendUsersListToAdmin(admin);
        }
    });

    ws.on("error", () => {
        try {
            ws.close();
        } catch (_) {}
    });
});

server.listen(PORT, "0.0.0.0", () => {
    console.log(`Col'inCall server running on port ${PORT}`);
});
