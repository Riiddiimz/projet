const http = require("http");
const crypto = require("crypto");
const WebSocket = require("ws");
const { supabaseAdmin, supabaseConfigured } = require("./lib/supabase");

const PORT = Number(process.env.PORT || 3000);
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "Riddimz";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const TURN_URLS = String(process.env.TURN_URLS || "").split(",").map(x => x.trim()).filter(Boolean);
const TURN_USERNAME = String(process.env.TURN_USERNAME || "");
const TURN_CREDENTIAL = String(process.env.TURN_CREDENTIAL || "");
const MAX_AVATAR_LENGTH = 300000;
const MAX_DESCRIPTION_LENGTH = 300;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// Persistent data lives in Supabase. These maps only hold live WebSocket state.
const users = new Map();
const rooms = new Map();
const sessions = new Map();
let GENERAL_ROOM_ID = null;

function safeSend(ws, data) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  try { ws.send(JSON.stringify(data)); return true; } catch { return false; }
}
function isOnline(user) { return !!(user?.ws && user.ws.readyState === WebSocket.OPEN); }
function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    isAdmin: !!user.isAdmin,
    roomId: user.roomId,
    microphoneEnabled: !!user.microphoneEnabled,
    cameraEnabled: !!user.cameraEnabled,
    microphoneLocked: !!user.microphoneLocked,
    cameraLocked: !!user.cameraLocked,
    diagnosticOptIn: !!user.diagnosticOptIn,
    description: user.description || "",
    avatarUrl: user.avatarUrl || null
  };
}
function publicRoom(room) {
  return {
    id: room.id,
    name: room.name,
    ownerId: room.ownerId,
    userCount: [...room.users].filter(id => isOnline(users.get(id))).length,
    permanent: !!room.permanent
  };
}
function broadcast(data, filter = () => true) {
  for (const user of users.values()) if (filter(user)) safeSend(user.ws, data);
}
function sendAdminData() {
  for (const user of users.values()) {
    if (user.isAdmin && isOnline(user)) {
      safeSend(user.ws, {
        type: "admin-data",
        rooms: [...rooms.values()].map(publicRoom),
        users: [...users.values()].map(publicUser)
      });
    }
  }
}
function broadcastRoom(roomId, data, excludeUserId = null) {
  const room = rooms.get(roomId);
  if (!room) return;
  for (const id of room.users) {
    if (id === excludeUserId) continue;
    const user = users.get(id);
    if (isOnline(user)) safeSend(user.ws, data);
  }
}
function sendRoomList() {
  broadcast({ type: "room-list", rooms: [...rooms.values()].map(publicRoom) });
  sendAdminData();
}
function sendUserList() {
  broadcast({ type: "user-list", users: [...users.values()].map(publicUser) });
  broadcast({ type: "online-user-list", users: [...users.values()].filter(isOnline).map(publicUser) });
  sendAdminData();
}

async function dbFindUserByUsername(username) {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id,username,avatar_url,description,created_at,updated_at")
    .ilike("username", username)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}
async function dbGetUserById(id) {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id,username,avatar_url,description,created_at,updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}
async function dbCreateUser(username) {
  const { data, error } = await supabaseAdmin
    .from("users")
    .insert({ username })
    .select("id,username,avatar_url,description,created_at,updated_at")
    .single();
  if (error) throw error;
  return data;
}
async function dbUpdateUser(user) {
  const { error } = await supabaseAdmin
    .from("users")
    .update({ username: user.username, avatar_url: user.avatarUrl || null, description: user.description || "" })
    .eq("id", user.id);
  if (error) throw error;
}
async function dbLoadRooms() {
  const { data, error } = await supabaseAdmin
    .from("rooms")
    .select("id,name,owner_id,created_at")
    .order("created_at", { ascending: true });
  if (error) throw error;

  for (const row of data || []) {
    rooms.set(row.id, {
      id: row.id,
      name: row.name,
      ownerId: row.owner_id,
      users: new Set(),
      createdAt: new Date(row.created_at).getTime(),
      permanent: false
    });
  }

  let general = [...rooms.values()].find(r => r.name === "Discussion générale" && r.ownerId === null);
  if (!general) {
    const { data: created, error: createError } = await supabaseAdmin
      .from("rooms")
      .insert({ name: "Discussion générale", owner_id: null, is_private: false })
      .select("id,name,owner_id,created_at")
      .single();
    if (createError) throw createError;
    general = {
      id: created.id,
      name: created.name,
      ownerId: null,
      users: new Set(),
      createdAt: new Date(created.created_at).getTime(),
      permanent: true
    };
    rooms.set(general.id, general);
  } else {
    general.permanent = true;
  }
  GENERAL_ROOM_ID = general.id;
}
async function dbCreateRoom(name, ownerId) {
  const { data, error } = await supabaseAdmin
    .from("rooms")
    .insert({ name, owner_id: ownerId, is_private: false })
    .select("id,name,owner_id,created_at")
    .single();
  if (error) throw error;
  return data;
}
async function dbDeleteRoom(roomId) {
  const { error } = await supabaseAdmin.from("rooms").delete().eq("id", roomId);
  if (error) throw error;
}
async function dbSaveMessage(roomId, userId, text) {
  const { data, error } = await supabaseAdmin
    .from("messages")
    .insert({ room_id: roomId, user_id: userId, content: text })
    .select("id,created_at")
    .single();
  if (error) throw error;
  return data;
}
async function dbSaveRoomVisit(userId, roomId) {
  const { error } = await supabaseAdmin
    .from("room_visits")
    .upsert({ user_id: userId, room_id: roomId, visited_at: new Date().toISOString() }, { onConflict: "user_id,room_id" });
  if (error) throw error;
}
async function saveAvatar(user, avatarInput) {
  if (!String(avatarInput).startsWith("data:image/")) return avatarInput;
  const match = String(avatarInput).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  const contentType = match[1].toLowerCase();
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > MAX_AVATAR_LENGTH) return null;
  const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  const path = `users/${user.id}.${ext}`;
  const { error } = await supabaseAdmin.storage.from("avatars").upload(path, buffer, {
    contentType,
    cacheControl: "3600",
    upsert: true
  });
  if (error) throw error;
  return supabaseAdmin.storage.from("avatars").getPublicUrl(path).data.publicUrl;
}
async function persistProfile(user, avatarInput) {
  if (typeof avatarInput === "string") user.avatarUrl = await saveAvatar(user, avatarInput);
  else if (avatarInput === null) user.avatarUrl = null;
  await dbUpdateUser(user);
}

function invalidateUserSessions(userId) {
  for (const [token, session] of sessions) if (session.userId === userId) sessions.delete(token);
}
function createSession(user) {
  invalidateUserSessions(user.id);
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, { userId: user.id, createdAt: Date.now() });
  return token;
}
function leaveRoom(user) {
  if (!user?.roomId) return;
  const roomId = user.roomId;
  const room = rooms.get(roomId);
  user.roomId = null;
  user.microphoneEnabled = false;
  user.cameraEnabled = false;
  if (!room) return;
  room.users.delete(user.id);
  broadcastRoom(roomId, { type: "room-user-left", userId: user.id });
  if (!room.permanent && room.users.size === 0) {
    rooms.delete(roomId);
    void dbDeleteRoom(roomId).catch(error => console.error("[Supabase] room delete", error));
  }
  safeSend(user.ws, { type: "room-left", roomId });
  sendRoomList();
  sendUserList();
}
function chatMessage(user, text, roomId, id, timestamp) {
  return { type: "chat", id: id || `${user.id}-${Date.now()}`, userId: user.id, username: user.username, text, roomId, timestamp: timestamp || Date.now() };
}
function sendIceConfig(ws) {
  if (!TURN_URLS.length || !TURN_USERNAME || !TURN_CREDENTIAL) {
    safeSend(ws, { type: "ice-config", iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }], turnConfigured: false });
    return;
  }
  safeSend(ws, { type: "ice-config", iceServers: [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
    { urls: TURN_URLS, username: TURN_USERNAME, credential: TURN_CREDENTIAL }
  ], turnConfigured: true });
}

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ status: "ok", supabaseConfigured, turnConfigured: !!(TURN_URLS.length && TURN_USERNAME && TURN_CREDENTIAL) }));
    return;
  }
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
});

const wss = new WebSocket.Server({ server });

wss.on("connection", ws => {
  let currentUser = null;
  safeSend(ws, { type: "connected" });

  ws.on("message", async raw => {
    try {
      let message;
      try { message = JSON.parse(raw.toString()); } catch { safeSend(ws, { type: "error", message: "Message invalide." }); return; }
      if (!message || typeof message.type !== "string") return;
      const type = message.type;

      if (type === "restore-session") {
        const token = String(message.sessionToken || message.token || "");
        const session = sessions.get(token);
        if (!session || Date.now() - session.createdAt > SESSION_TTL_MS) {
          if (session) sessions.delete(token);
          safeSend(ws, { type: "session-invalid" }); return;
        }
        const stored = await dbGetUserById(session.userId);
        if (!stored) { sessions.delete(token); safeSend(ws, { type: "session-invalid" }); return; }
        let user = users.get(stored.id);
        if (!user) {
          user = {
            id: stored.id,
            username: stored.username,
            isAdmin: stored.username.toLowerCase() === ADMIN_USERNAME.toLowerCase(),
            ws: null,
            roomId: null,
            microphoneEnabled: false,
            cameraEnabled: false,
            microphoneLocked: false,
            cameraLocked: false,
            diagnosticOptIn: false,
            description: stored.description || "",
            avatarUrl: stored.avatar_url || null,
            connectedAt: Date.now(),
            lastSeenAt: Date.now()
          };
          users.set(user.id, user);
        }
        if (user.ws && user.ws !== ws) try { user.ws.close(4001, "Session reprise"); } catch {}
        user.username = stored.username;
        user.description = stored.description || "";
        user.avatarUrl = stored.avatar_url || null;
        user.ws = ws;
        user.lastSeenAt = Date.now();
        currentUser = user;
        safeSend(ws, { type: "session-restored", user: publicUser(user), sessionToken: token });
        sendIceConfig(ws); sendRoomList(); sendUserList(); return;
      }

      if (type === "login") {
        const username = String(message.username || "").trim().slice(0, 50);
        const password = String(message.password || "");
        const wantsAdmin = !!message.isAdmin;
        if (!username) { safeSend(ws, { type: "login-error", message: "Nom d'utilisateur obligatoire." }); return; }
        const isAdmin = username.toLowerCase() === ADMIN_USERNAME.toLowerCase() && !!ADMIN_PASSWORD && password === ADMIN_PASSWORD;
        if (wantsAdmin && !isAdmin) { safeSend(ws, { type: "login-error", message: "Identifiants administrateur incorrects." }); return; }
        if (username.toLowerCase() === ADMIN_USERNAME.toLowerCase() && !isAdmin) { safeSend(ws, { type: "login-error", message: "Identifiants administrateur incorrects." }); return; }
        const existingLive = [...users.values()].find(u => u.username.toLowerCase() === username.toLowerCase());
        if (existingLive && isOnline(existingLive)) { safeSend(ws, { type: "login-error", message: "Ce nom d'utilisateur est déjà utilisé." }); return; }

        let stored = await dbFindUserByUsername(username);
        if (!stored) stored = await dbCreateUser(username);
        let user = users.get(stored.id);
        if (!user) {
          user = {
            id: stored.id,
            username: stored.username,
            isAdmin,
            ws: null,
            roomId: null,
            microphoneEnabled: false,
            cameraEnabled: false,
            microphoneLocked: false,
            cameraLocked: false,
            diagnosticOptIn: false,
            description: stored.description || "",
            avatarUrl: stored.avatar_url || null,
            connectedAt: Date.now(),
            lastSeenAt: Date.now()
          };
          users.set(user.id, user);
        }
        user.username = stored.username;
        user.isAdmin = isAdmin;
        user.description = stored.description || "";
        user.avatarUrl = stored.avatar_url || null;
        user.ws = ws;
        user.lastSeenAt = Date.now();
        user.microphoneEnabled = false;
        user.cameraEnabled = false;
        user.diagnosticOptIn = false;
        currentUser = user;
        const token = createSession(user);
        safeSend(ws, { type: "login-success", user: publicUser(user), sessionToken: token });
        sendIceConfig(ws); sendRoomList(); sendUserList(); return;
      }

      if (!currentUser) { safeSend(ws, { type: "error", message: "Vous devez être connecté." }); return; }
      currentUser.lastSeenAt = Date.now();
      if (type === "ice-config") { sendIceConfig(ws); return; }
      if (type === "logout") {
        const user = currentUser; currentUser = null;
        leaveRoom(user); invalidateUserSessions(user.id); users.delete(user.id);
        safeSend(ws, { type: "logout-success" });
        try { ws.close(1000, "Logout"); } catch {}
        sendRoomList(); sendUserList(); return;
      }
      if (type === "update-profile") {
        if (typeof message.description === "string") currentUser.description = message.description.slice(0, MAX_DESCRIPTION_LENGTH);
        if (typeof message.avatarUrl === "string" && message.avatarUrl.length <= MAX_AVATAR_LENGTH) await persistProfile(currentUser, message.avatarUrl);
        else if (message.avatarUrl === null) await persistProfile(currentUser, null);
        else await dbUpdateUser(currentUser);
        safeSend(ws, { type: "profile-updated", user: publicUser(currentUser) }); sendUserList(); return;
      }
      if (type === "diagnostic-opt-in") {
        currentUser.diagnosticOptIn = !!message.enabled;
        safeSend(ws, { type: "diagnostic-state", enabled: currentUser.diagnosticOptIn }); sendUserList(); return;
      }
      if (type === "create-room") {
        const name = String(message.name || "").trim().slice(0, 50);
        if (!name) { safeSend(ws, { type: "error", message: "Nom du salon obligatoire." }); return; }
        const storedRoom = await dbCreateRoom(name, currentUser.id);
        const room = { id: storedRoom.id, name: storedRoom.name, ownerId: storedRoom.owner_id, users: new Set(), createdAt: new Date(storedRoom.created_at).getTime(), permanent: false };
        rooms.set(room.id, room); sendRoomList(); safeSend(ws, { type: "room-created", room: publicRoom(room) }); return;
      }
      if (type === "join-room") {
        const roomId = String(message.roomId || "");
        const room = rooms.get(roomId);
        if (!room) { safeSend(ws, { type: "error", message: "Salon introuvable." }); return; }
        if (currentUser.roomId) leaveRoom(currentUser);
        currentUser.roomId = roomId; currentUser.microphoneEnabled = false; currentUser.cameraEnabled = false; room.users.add(currentUser.id);
        void dbSaveRoomVisit(currentUser.id, roomId).catch(error => console.error("[Supabase] room visit", error));
        const participants = [...room.users].filter(id => id !== currentUser.id).map(id => users.get(id)).filter(isOnline).map(publicUser);
        safeSend(ws, { type: "room-joined", room: publicRoom(room), participants, users: participants });
        broadcastRoom(roomId, { type: "room-user-joined", user: publicUser(currentUser) }, currentUser.id); sendRoomList(); sendUserList(); return;
      }
      if (type === "leave-room") { leaveRoom(currentUser); return; }
      if (type === "chat") {
        const text = String(message.text || "").trim().slice(0, 1000); if (!text) return;
        const roomId = message.roomId && currentUser.roomId === message.roomId ? currentUser.roomId : null;
        let storedMessage = null;
        if (roomId) storedMessage = await dbSaveMessage(roomId, currentUser.id, text);
        const payload = chatMessage(currentUser, text, roomId, storedMessage?.id, storedMessage?.created_at ? new Date(storedMessage.created_at).getTime() : Date.now());
        if (roomId) broadcastRoom(roomId, payload); else broadcast(payload, user => isOnline(user) && !user.roomId); return;
      }
      if (type === "offer" || type === "answer" || type === "candidate") {
        const targetId = String(message.targetId || ""); const target = users.get(targetId); const sourceRoomId = currentUser.roomId;
        if (!sourceRoomId || !target || !isOnline(target) || target.roomId !== sourceRoomId || target.id === currentUser.id) { safeSend(ws, { type: "signaling-error", message: "Pair WebRTC invalide." }); return; }
        const payload = { type, fromId: currentUser.id };
        if (type === "offer") payload.offer = message.offer; if (type === "answer") payload.answer = message.answer; if (type === "candidate") payload.candidate = message.candidate;
        safeSend(target.ws, payload); return;
      }
      if (type === "media-state") {
        if (typeof message.microphoneEnabled === "boolean" && !currentUser.microphoneLocked) currentUser.microphoneEnabled = message.microphoneEnabled;
        if (typeof message.cameraEnabled === "boolean" && !currentUser.cameraLocked) currentUser.cameraEnabled = message.cameraEnabled;
        if (currentUser.roomId) broadcastRoom(currentUser.roomId, { type: "remote-media-state", userId: currentUser.id, microphoneEnabled: currentUser.microphoneEnabled, cameraEnabled: currentUser.cameraEnabled, microphoneLocked: currentUser.microphoneLocked, cameraLocked: currentUser.cameraLocked }, currentUser.id);
        sendUserList(); return;
      }
      if (type.startsWith("admin-") && !currentUser.isAdmin) { safeSend(ws, { type: "admin-error", message: "Accès administrateur refusé." }); return; }
      if (type === "admin-mute" || type === "admin-camera") {
        const target = users.get(String(message.userId || "")); if (!target || target.id === currentUser.id) return;
        if (type === "admin-mute") { target.microphoneEnabled = false; target.microphoneLocked = true; } else { target.cameraEnabled = false; target.cameraLocked = true; }
        safeSend(target.ws, { type: "force-media-state", microphoneEnabled: target.microphoneEnabled, cameraEnabled: target.cameraEnabled, microphoneLocked: target.microphoneLocked, cameraLocked: target.cameraLocked, reason: type });
        if (target.roomId) broadcastRoom(target.roomId, { type: "remote-media-state", userId: target.id, microphoneEnabled: target.microphoneEnabled, cameraEnabled: target.cameraEnabled, microphoneLocked: target.microphoneLocked, cameraLocked: target.cameraLocked }, target.id);
        sendUserList(); return;
      }
      if (type === "admin-unmute" || type === "admin-camera-enable") {
        const target = users.get(String(message.userId || "")); if (!target) return;
        if (type === "admin-unmute") { target.microphoneLocked = false; target.microphoneEnabled = false; } else { target.cameraLocked = false; target.cameraEnabled = false; }
        safeSend(target.ws, { type: "force-media-state", microphoneEnabled: target.microphoneEnabled, cameraEnabled: target.cameraEnabled, microphoneLocked: target.microphoneLocked, cameraLocked: target.cameraLocked, reason: type });
        if (target.roomId) broadcastRoom(target.roomId, { type: "remote-media-state", userId: target.id, microphoneEnabled: target.microphoneEnabled, cameraEnabled: target.cameraEnabled, microphoneLocked: target.microphoneLocked, cameraLocked: target.cameraLocked }, target.id);
        sendUserList(); return;
      }
      if (type === "admin-kick") {
        const target = users.get(String(message.userId || "")); if (!target || target.id === currentUser.id) return;
        const targetWs = target.ws; leaveRoom(target); invalidateUserSessions(target.id); target.ws = null;
        safeSend(targetWs, { type: "force-lobby", message: "Vous avez été exclu par l'administrateur." }); try { targetWs?.close(4003, "Kicked"); } catch {} sendUserList(); return;
      }
      if (type === "admin-delete-room") {
        const roomId = String(message.roomId || ""); const room = rooms.get(roomId); if (!room) return;
        if (room.permanent) { safeSend(ws, { type: "admin-error", message: "Impossible de supprimer ce salon." }); return; }
        for (const userId of room.users) {
          const user = users.get(userId); if (!user) continue;
          user.roomId = null; user.microphoneEnabled = false; user.cameraEnabled = false; safeSend(user.ws, { type: "room-deleted", roomId });
        }
        rooms.delete(roomId); await dbDeleteRoom(roomId); sendRoomList(); sendUserList(); return;
      }
      if (type === "admin-refresh") {
        safeSend(ws, { type: "admin-data", rooms: [...rooms.values()].map(publicRoom), users: [...users.values()].map(publicUser) });
      }
    } catch (error) {
      console.error("[server] message error", error);
      safeSend(ws, { type: "error", message: "Erreur serveur." });
    }
  });

  ws.on("close", () => {
    if (!currentUser || currentUser.ws !== ws) return;
    const user = currentUser; user.ws = null; user.lastSeenAt = Date.now(); user.microphoneEnabled = false; user.cameraEnabled = false; user.diagnosticOptIn = false;
    if (user.roomId) leaveRoom(user);
    sendRoomList(); sendUserList();
  });
});

async function start() {
  if (!supabaseConfigured) {
    console.error("[Supabase] Missing SUPABASE_URL or SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  try {
    await dbLoadRooms();
    console.log(`[Supabase] Ready. ${rooms.size} room(s) loaded.`);
    server.listen(PORT, () => console.log(`Col'inCall server listening on port ${PORT}`));
  } catch (error) {
    console.error("[Supabase] Startup failed", error);
    process.exit(1);
  }
}

setInterval(() => {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [token, session] of sessions) if (session.createdAt < cutoff) sessions.delete(token);
}, 60 * 60 * 1000);

start();
