const http = require("http");
const WebSocket = require("ws");
const crypto = require("crypto");

const PORT = process.env.PORT || 10000;

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
  });

  res.end(JSON.stringify({
    status: "online",
    service: "Vibe Rooms"
  }));
});

const wss = new WebSocket.Server({ server });

const rooms = new Map();
const clients = new Map();

function send(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function broadcast(room, data, except = null) {
  if (!room) return;

  for (const client of room) {
    if (client !== except) {
      send(client, data);
    }
  }
}

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Set());
  }

  return rooms.get(roomId);
}

function removeClient(ws) {
  const info = clients.get(ws);

  if (!info) return;

  const room = rooms.get(info.roomId);

  if (room) {
    room.delete(ws);

    broadcast(room, {
      type: "user-left",
      userId: info.userId
    }, ws);

    if (room.size === 0) {
      rooms.delete(info.roomId);
    }
  }

  clients.delete(ws);
}

wss.on("connection", ws => {

  const userId = crypto.randomUUID();

  clients.set(ws, {
    userId,
    roomId: null,
    name: "Invité"
  });

  send(ws, {
    type: "connected",
    userId
  });

  ws.on("message", raw => {

    let message;

    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }

    const info = clients.get(ws);

    if (!info) return;

    /*
    --------------------------------------------------
    JOIN ROOM
    --------------------------------------------------
    */

    if (message.type === "join-room") {

      const roomId =
        String(message.roomId || "general")
          .slice(0, 50);

      const name =
        String(message.name || "Invité")
          .slice(0, 30);

      if (info.roomId) {
        removeClient(ws);
      }

      info.roomId = roomId;
      info.name = name;

      const room = getRoom(roomId);

      /*
      Envoyer les utilisateurs déjà présents
      au nouvel utilisateur.
      */

      for (const other of room) {

        const otherInfo =
          clients.get(other);

        if (!otherInfo) continue;

        send(ws, {
          type: "user-joined",
          userId: otherInfo.userId,
          name: otherInfo.name,
          existing: true
        });
      }

      room.add(ws);

      /*
      Prévenir les autres
      */

      broadcast(room, {
        type: "user-joined",
        userId,
        name
      }, ws);

      send(ws, {
        type: "room-joined",
        roomId,
        count: room.size
      });

      return;
    }

    /*
    --------------------------------------------------
    WEBRTC SIGNALING
    --------------------------------------------------
    */

    if (
      message.type === "offer" ||
      message.type === "answer" ||
      message.type === "ice-candidate"
    ) {

      const target =
        [...clients.entries()]
          .find(([client]) => {
            const clientInfo =
              clients.get(client);

            return (
              clientInfo &&
              clientInfo.userId === message.target
            );
          });

      if (!target) return;

      send(target[0], {
        type: message.type,
        from: info.userId,
        name: info.name,
        data: message.data
      });

      return;
    }

    /*
    --------------------------------------------------
    CHAT
    --------------------------------------------------
    */

    if (message.type === "chat") {

      const room =
        rooms.get(info.roomId);

      if (!room) return;

      const text =
        String(message.text || "")
          .trim()
          .slice(0, 500);

      if (!text) return;

      broadcast(room, {
        type: "chat",
        userId: info.userId,
        name: info.name,
        text,
        timestamp: Date.now()
      });

      return;
    }

    /*
    --------------------------------------------------
    LEAVE
    --------------------------------------------------
    */

    if (message.type === "leave") {
      removeClient(ws);
    }

  });

  ws.on("close", () => {
    removeClient(ws);
  });

  ws.on("error", () => {
    removeClient(ws);
  });

});

server.listen(PORT, "0.0.0.0", () => {
  console.log(
    `Vibe server running on port ${PORT}`
  );
});
