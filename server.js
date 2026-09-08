const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 10000;

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
  });

  res.end(JSON.stringify({
    status: "online",
    service: "Chatroulette WebRTC Server"
  }));
});

const wss = new WebSocket.Server({ server });

const waiting = [];
const clients = new Map();

function send(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function removeFromWaiting(ws) {
  const index = waiting.indexOf(ws);

  if (index !== -1) {
    waiting.splice(index, 1);
  }
}

function findPartner(ws) {
  while (waiting.length > 0) {
    const candidate = waiting.shift();

    if (
      candidate !== ws &&
      candidate.readyState === WebSocket.OPEN &&
      !candidate.partner
    ) {
      return candidate;
    }
  }

  return null;
}

function match(ws) {
  removeFromWaiting(ws);

  if (ws.partner) {
    return;
  }

  const partner = findPartner(ws);

  if (!partner) {
    waiting.push(ws);

    send(ws, {
      type: "searching"
    });

    return;
  }

  ws.partner = partner;
  partner.partner = ws;

  send(ws, {
    type: "matched",
    initiator: true
  });

  send(partner, {
    type: "matched",
    initiator: false
  });
}

function disconnectPartner(ws) {
  const partner = ws.partner;

  if (!partner) {
    return;
  }

  ws.partner = null;

  if (partner.partner === ws) {
    partner.partner = null;

    send(partner, {
      type: "peer-left"
    });
  }
}

wss.on("connection", (ws) => {
  ws.partner = null;

  clients.set(ws, {
    connectedAt: Date.now()
  });

  send(ws, {
    type: "connected"
  });

  ws.on("message", (raw) => {
    let message;

    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }

    switch (message.type) {
      case "join":
        match(ws);
        break;

      case "next":
        disconnectPartner(ws);
        match(ws);
        break;

      case "offer":
      case "answer":
      case "ice-candidate":
      case "chat":
        if (ws.partner) {
          send(ws.partner, {
            type: message.type,
            data: message.data
          });
        }
        break;

      case "report":
        console.log("Report received");

        if (ws.partner) {
          send(ws.partner, {
            type: "reported"
          });
        }

        break;

      case "leave":
        removeFromWaiting(ws);
        disconnectPartner(ws);
        break;
    }
  });

  ws.on("close", () => {
    removeFromWaiting(ws);
    disconnectPartner(ws);
    clients.delete(ws);
  });

  ws.on("error", () => {
    removeFromWaiting(ws);
    disconnectPartner(ws);
    clients.delete(ws);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
