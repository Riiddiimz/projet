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

function createId() {
    return crypto.randomUUID();
}

function cleanText(value, maxLength = 500) {
    return String(value || "")
        .trim()
        .replace(/[<>]/g, "")
        .slice(0, maxLength);
}

function send(ws, type, data = {}) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type,
            ...data
        }));
    }
}

function getUser(ws) {
    return users.get(ws);
}

function getUserById(id) {
    for (const user of users.values()) {
        if (user.id === id) return user;
    }

    return null;
}

function publicUser(user) {
    return {
        id: user.id,
        username: user.username,
        role: user.role,
        roomId: user.roomId,
        profile: user.profile,
        muted: user.muted,
        cameraDisabled: user.cameraDisabled
    };
}

function broadcastRoomList() {
    const roomList = [...rooms.values()].map(room => ({
        id: room.id,
        name: room.name,
        count: room.members.size
    }));

    for (const user of users.values()) {
        send(user.ws, "room-list", {
            rooms: roomList
        });
    }
}

function broadcastAdminUsers() {
    const userList = [...users.values()].map(publicUser);

    for (const user of users.values()) {
        if (user.role === "admin") {
            send(user.ws, "users-list", {
                users: userList
            });
        }
    }
}

function broadcastToRoom(roomId, type, data = {}, excludedWs = null) {
    const room = rooms.get(roomId);

    if (!room) return;

    for (const memberWs of room.members) {
        if (memberWs !== excludedWs) {
            send(memberWs, type, data);
        }
    }
}

function createRoom(name) {
    const room = {
        id: createId(),
        name: cleanText(name, 40) || "Nouveau salon",
        members: new Set()
    };

    rooms.set(room.id, room);

    return room;
}

function leaveRoom(user, notify = true) {
    if (!user.roomId) return;

    const room = rooms.get(user.roomId);

    if (room) {
        room.members.delete(user.ws);

        if (notify) {
            broadcastToRoom(room.id, "user-left", {
                userId: user.id
            });
        }

        if (room.members.size === 0) {
            rooms.delete(room.id);
        }
    }

    user.roomId = null;

    broadcastRoomList();
    broadcastAdminUsers();
}

createRoom("Salon général");

const server = http.createServer((req, res) => {
    if (req.url === "/" || req.url === "/index.html") {
        const indexPath = path.join(__dirname, "index.html");

        if (fs.existsSync(indexPath)) {
            res.writeHead(200, {
                "Content-Type": "text/html; charset=utf-8"
            });

            return fs.createReadStream(indexPath).pipe(res);
        }
    }

    res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8"
    });

    res.end(JSON.stringify({
        status: "online",
        service: "Chatroulette WebRTC Server",
        rooms: rooms.size,
        users: users.size
    }));
});

const wss = new WebSocket.Server({
    server
});

wss.on("connection", ws => {
    const user = {
        id: createId(),
        ws,
        username: "",
        role: "user",
        roomId: null,
        profile: {
            description: "",
            avatar: null
        },
        muted: false,
        cameraDisabled: false
    };

    users.set(ws, user);

    send(ws, "connected", {
        userId: user.id
    });

    ws.on("message", rawMessage => {
        let message;

        try {
            message = JSON.parse(rawMessage.toString());
        } catch {
            return send(ws, "error-message", {
                message: "Message invalide."
            });
        }

        switch (message.type) {
            case "login": {
                const username = cleanText(message.username, 24);
                const role = message.role === "admin" ? "admin" : "user";

                if (!username) {
                    return send(ws, "login-error", {
                        message: "Le pseudo est obligatoire."
                    });
                }

                const duplicate = [...users.values()].find(other =>
                    other !== user &&
                    other.username.toLowerCase() === username.toLowerCase()
                );

                if (duplicate) {
                    return send(ws, "login-error", {
                        message: "Ce pseudo est déjà utilisé."
                    });
                }

                if (
                    role === "admin" &&
                    (
                        username !== ADMIN_USERNAME ||
                        String(message.adminCode || "") !== ADMIN_CODE
                    )
                ) {
                    return send(ws, "login-error", {
                        message: "Identifiants administrateur incorrects."
                    });
                }

                user.username = username;
                user.role = role;

                send(ws, "login-success", {
                    user: publicUser(user)
                });

                broadcastRoomList();
                broadcastAdminUsers();

                break;
            }

            case "update-profile": {
                if (!user.username) return;

                user.profile = {
                    description: cleanText(message.description, 300),
                    avatar:
                        typeof message.avatar === "string"
                            ? message.avatar.slice(0, 500000)
                            : null
                };

                send(ws, "profile-updated", {
                    user: publicUser(user)
                });

                if (user.roomId) {
                    broadcastToRoom(user.roomId, "user-updated", {
                        user: publicUser(user)
                    });
                }

                broadcastAdminUsers();

                break;
            }

            case "create-room": {
                if (!user.username) return;

                const room = createRoom(message.name);

                broadcastRoomList();

                send(ws, "room-created", {
                    room: {
                        id: room.id,
                        name: room.name,
                        count: 0
                    }
                });

                break;
            }

            case "join-room": {
                if (!user.username) return;

                const room = rooms.get(message.roomId);

                if (!room) {
                    return send(ws, "error-message", {
                        message: "Ce salon n'existe plus."
                    });
                }

                leaveRoom(user, true);

                const participants = [...room.members].map(memberWs =>
                    publicUser(getUser(memberWs))
                );

                room.members.add(ws);
                user.roomId = room.id;

                send(ws, "room-joined", {
                    room: {
                        id: room.id,
                        name: room.name
                    },
                    participants
                });

                broadcastToRoom(room.id, "user-joined", {
                    user: publicUser(user)
                }, ws);

                broadcastRoomList();
                broadcastAdminUsers();

                break;
            }

            case "leave-room": {
                leaveRoom(user, true);
                send(ws, "room-left");
                break;
            }

            case "chat": {
                if (!user.roomId) return;

                const text = cleanText(message.text, 1000);

                if (!text) return;

                broadcastToRoom(user.roomId, "chat-message", {
                    user: publicUser(user),
                    text,
                    timestamp: Date.now()
                });

                break;
            }

            case "offer":
            case "answer":
            case "ice-candidate": {
                const target = getUserById(message.targetId);

                if (!target) return;

                send(target.ws, message.type, {
                    fromId: user.id,
                    offer: message.offer,
                    answer: message.answer,
                    candidate: message.candidate
                });

                break;
            }

            case "admin-kick": {
                if (user.role !== "admin") return;

                const target = getUserById(message.userId);

                if (!target || target === user) return;

                send(target.ws, "kicked", {
                    message: "Vous avez été expulsé par l'administrateur."
                });

                leaveRoom(target, true);
                broadcastAdminUsers();

                break;
            }

            case "admin-mute": {
                if (user.role !== "admin") return;

                const target = getUserById(message.userId);

                if (!target || target === user) return;

                target.muted = Boolean(message.muted);

                send(target.ws, "force-micro", {
                    enabled: !target.muted
                });

                broadcastAdminUsers();

                break;
            }

            case "admin-camera": {
                if (user.role !== "admin") return;

                const target = getUserById(message.userId);

                if (!target || target === user) return;

                target.cameraDisabled = Boolean(message.disabled);

                send(target.ws, "force-camera", {
                    enabled: !target.cameraDisabled
                });

                broadcastAdminUsers();

                break;
            }

            case "admin-delete-room": {
                if (user.role !== "admin") return;

                const room = rooms.get(message.roomId);

                if (!room) return;

                for (const memberWs of room.members) {
                    const member = getUser(memberWs);

                    if (member) {
                        send(member.ws, "room-deleted", {
                            message: "Ce salon a été supprimé par l'administrateur."
                        });

                        member.roomId = null;
                    }
                }

                rooms.delete(room.id);

                broadcastRoomList();
                broadcastAdminUsers();

                break;
            }
        }
    });

    ws.on("close", () => {
        leaveRoom(user, true);
        users.delete(ws);

        broadcastRoomList();
        broadcastAdminUsers();
    });
});

server.listen(PORT, "0.0.0.0", () => {
    console.log(`Col'inCall server listening on port ${PORT}`);
});
