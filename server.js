const http = require("http");
const crypto = require("crypto");
const WebSocket = require("ws");

const PORT = Number(process.env.PORT || 3000);
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "Riddimz";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const MAX_AVATAR_LENGTH = 300000;
const MAX_DESCRIPTION_LENGTH = 300;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const users = new Map();
const rooms = new Map();
const sessions = new Map();
let nextUserId = 1;
let nextRoomId = 1;
let nextMessageId = 1;

const GENERAL_ROOM_ID = "general";
rooms.set(GENERAL_ROOM_ID, { id: GENERAL_ROOM_ID, name: "Discussion générale", ownerId: null, users: new Set(), createdAt: Date.now(), permanent: true });

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
});

const wss = new WebSocket.Server({ server });
function safeSend(ws, data) { if (!ws || ws.readyState !== WebSocket.OPEN) return false; try { ws.send(JSON.stringify(data)); return true; } catch { return false; } }
function isOnline(user) { return !!(user?.ws && user.ws.readyState === WebSocket.OPEN); }
function publicUser(user) { return { id: user.id, username: user.username, isAdmin: !!user.isAdmin, roomId: user.roomId, microphoneEnabled: !!user.microphoneEnabled, cameraEnabled: !!user.cameraEnabled, microphoneLocked: !!user.microphoneLocked, cameraLocked: !!user.cameraLocked, description: user.description || "", avatarUrl: user.avatarUrl || null }; }
function publicRoom(room) { return { id: room.id, name: room.name, ownerId: room.ownerId, userCount: [...room.users].filter(id => isOnline(users.get(id))).length, permanent: !!room.permanent }; }
function broadcast(data, filter = () => true) { for (const user of users.values()) if (filter(user)) safeSend(user.ws, data); }
function sendAdminData() { for (const user of users.values()) if (user.isAdmin && isOnline(user)) safeSend(user.ws, { type: "admin-data", rooms: [...rooms.values()].map(publicRoom), users: [...users.values()].map(publicUser) }); }
function broadcastRoom(roomId, data, excludeUserId = null) { const room = rooms.get(roomId); if (!room) return; for (const id of room.users) { if (id === excludeUserId) continue; const user = users.get(id); if (isOnline(user)) safeSend(user.ws, data); } }
function sendRoomList() { broadcast({ type: "room-list", rooms: [...rooms.values()].map(publicRoom) }); sendAdminData(); }
function sendUserList() { broadcast({ type: "user-list", users: [...users.values()].map(publicUser) }); broadcast({ type: "online-user-list", users: [...users.values()].filter(isOnline).map(publicUser) }); sendAdminData(); }
function removeUserFromRoom(user, notify = true) { if (!user?.roomId) return; const roomId = user.roomId; const room = rooms.get(roomId); user.roomId = null; user.microphoneEnabled = false; user.cameraEnabled = false; if (!room) return; room.users.delete(user.id); if (notify) broadcastRoom(roomId, { type: "room-user-left", userId: user.id }); if (!room.permanent && room.users.size === 0) rooms.delete(roomId); sendRoomList(); sendUserList(); }
function invalidateUserSessions(userId) { for (const [token, session] of sessions) if (session.userId === userId) sessions.delete(token); }
function createSession(user) { invalidateUserSessions(user.id); const token = crypto.randomBytes(32).toString("hex"); sessions.set(token, { userId: user.id, createdAt: Date.now() }); return token; }
function findUserByUsername(username) { const normalized = username.toLowerCase(); for (const user of users.values()) if (user.username.toLowerCase() === normalized) return user; return null; }
function leaveRoom(user) { if (!user?.roomId) return; const roomId = user.roomId; removeUserFromRoom(user, true); safeSend(user.ws, { type: "room-left", roomId }); }
function chatMessage(user, text, roomId) { return { type: "chat", id: nextMessageId++, userId: user.id, username: user.username, text, roomId, timestamp: Date.now() }; }

wss.on("connection", ws => {
  let currentUser = null;
  safeSend(ws, { type: "connected" });
  ws.on("message", raw => {
    let message; try { message = JSON.parse(raw.toString()); } catch { safeSend(ws, { type: "error", message: "Message invalide." }); return; }
    if (!message || typeof message.type !== "string") return;
    const type = message.type;
    if (type === "restore-session") {
      const token = String(message.sessionToken || message.token || ""); const session = sessions.get(token);
      if (!session || Date.now() - session.createdAt > SESSION_TTL_MS) { if (session) sessions.delete(token); safeSend(ws, { type: "session-invalid" }); return; }
      const user = users.get(session.userId); if (!user) { sessions.delete(token); safeSend(ws, { type: "session-invalid" }); return; }
      if (user.ws && user.ws !== ws) try { user.ws.close(4001, "Session reprise"); } catch {}
      currentUser = user; currentUser.ws = ws; currentUser.lastSeenAt = Date.now();
      safeSend(ws, { type: "session-restored", user: publicUser(user), sessionToken: token }); sendRoomList(); sendUserList(); return;
    }
    if (type === "login") {
      const username = String(message.username || "").trim().slice(0, 50); const password = String(message.password || ""); const wantsAdmin = !!message.isAdmin;
      if (!username) { safeSend(ws, { type: "login-error", message: "Nom d'utilisateur obligatoire." }); return; }
      const isAdmin = username.toLowerCase() === ADMIN_USERNAME.toLowerCase() && !!ADMIN_PASSWORD && password === ADMIN_PASSWORD;
      if (wantsAdmin && !isAdmin) { safeSend(ws, { type: "login-error", message: "Identifiants administrateur incorrects." }); return; }
      if (username.toLowerCase() === ADMIN_USERNAME.toLowerCase() && !isAdmin) { safeSend(ws, { type: "login-error", message: "Ce nom d'utilisateur est réservé." }); return; }
      const existing = findUserByUsername(username); if (existing && isOnline(existing)) { safeSend(ws, { type: "login-error", message: "Ce nom d'utilisateur est déjà utilisé." }); return; }
      const user = existing || { id: `user-${nextUserId++}`, username, isAdmin, ws: null, roomId: null, microphoneEnabled: false, cameraEnabled: false, microphoneLocked: false, cameraLocked: false, description: "", avatarUrl: null, connectedAt: Date.now(), lastSeenAt: Date.now() };
      user.username = username; user.isAdmin = isAdmin; user.ws = ws; user.lastSeenAt = Date.now(); user.microphoneEnabled = false; user.cameraEnabled = false;
      users.set(user.id, user); currentUser = user; const token = createSession(user);
      safeSend(ws, { type: "login-success", user: publicUser(user), sessionToken: token }); sendRoomList(); sendUserList(); return;
    }
    if (!currentUser) { safeSend(ws, { type: "error", message: "Vous devez être connecté." }); return; }
    currentUser.lastSeenAt = Date.now();
    if (type === "logout") { const user = currentUser; currentUser = null; removeUserFromRoom(user, true); invalidateUserSessions(user.id); users.delete(user.id); safeSend(ws, { type: "logout-success" }); try { ws.close(1000, "Logout"); } catch {} sendRoomList(); sendUserList(); return; }
    if (type === "update-profile") { if (typeof message.description === "string") currentUser.description = message.description.slice(0, MAX_DESCRIPTION_LENGTH); if (typeof message.avatarUrl === "string" && message.avatarUrl.length <= MAX_AVATAR_LENGTH) currentUser.avatarUrl = message.avatarUrl; else if (message.avatarUrl === null) currentUser.avatarUrl = null; safeSend(ws, { type: "profile-updated", user: publicUser(currentUser) }); sendUserList(); return; }
    if (type === "create-room") { const name = String(message.name || "").trim().slice(0, 50); if (!name) { safeSend(ws, { type: "error", message: "Nom du salon obligatoire." }); return; } const room = { id: `room-${nextRoomId++}`, name, ownerId: currentUser.id, users: new Set(), createdAt: Date.now(), permanent: false }; rooms.set(room.id, room); sendRoomList(); safeSend(ws, { type: "room-created", room: publicRoom(room) }); return; }
    if (type === "join-room") { const roomId = String(message.roomId || ""); const room = rooms.get(roomId); if (!room) { safeSend(ws, { type: "error", message: "Salon introuvable." }); return; } if (currentUser.roomId) removeUserFromRoom(currentUser, true); currentUser.roomId = roomId; currentUser.microphoneEnabled = false; currentUser.cameraEnabled = false; room.users.add(currentUser.id); const participants = [...room.users].filter(id => id !== currentUser.id).map(id => users.get(id)).filter(isOnline).map(publicUser); safeSend(ws, { type: "room-joined", room: publicRoom(room), participants, users: participants }); broadcastRoom(roomId, { type: "room-user-joined", user: publicUser(currentUser) }, currentUser.id); sendRoomList(); sendUserList(); return; }
    if (type === "leave-room") { leaveRoom(currentUser); return; }
    if (type === "chat") { const text = String(message.text || "").trim().slice(0, 1000); if (!text) return; const roomId = message.roomId && currentUser.roomId === message.roomId ? currentUser.roomId : null; const payload = chatMessage(currentUser, text, roomId); if (roomId) broadcastRoom(roomId, payload); else broadcast(payload, user => isOnline(user) && !user.roomId); return; }
    if (type === "offer" || type === "answer" || type === "candidate") {
      const targetId = String(message.targetId || ""); const target = users.get(targetId); const sourceRoomId = currentUser.roomId;
      if (!sourceRoomId || !target || !isOnline(target) || target.roomId !== sourceRoomId || target.id === currentUser.id) { safeSend(ws, { type: "signaling-error", message: "Pair WebRTC invalide." }); return; }
      const payload = { type, fromId: currentUser.id }; if (type === "offer") payload.offer = message.offer; if (type === "answer") payload.answer = message.answer; if (type === "candidate") payload.candidate = message.candidate; safeSend(target.ws, payload); return;
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
      if (type === "admin-mute") { target.microphoneEnabled = false; target.microphoneLocked = true; }
      else { target.cameraEnabled = false; target.cameraLocked = true; }
      safeSend(target.ws, { type: "force-media-state", microphoneEnabled: target.microphoneEnabled, cameraEnabled: target.cameraEnabled, microphoneLocked: target.microphoneLocked, cameraLocked: target.cameraLocked, reason: type });
      if (target.roomId) broadcastRoom(target.roomId, { type: "remote-media-state", userId: target.id, microphoneEnabled: target.microphoneEnabled, cameraEnabled: target.cameraEnabled, microphoneLocked: target.microphoneLocked, cameraLocked: target.cameraLocked }, target.id);
      sendUserList(); return;
    }
    if (type === "admin-unmute" || type === "admin-camera-enable") {
      const target = users.get(String(message.userId || "")); if (!target) return;
      if (type === "admin-unmute") { target.microphoneLocked = false; target.microphoneEnabled = false; }
      else { target.cameraLocked = false; target.cameraEnabled = false; }
      safeSend(target.ws, { type: "force-media-state", microphoneEnabled: target.microphoneEnabled, cameraEnabled: target.cameraEnabled, microphoneLocked: target.microphoneLocked, cameraLocked: target.cameraLocked, reason: type });
      if (target.roomId) broadcastRoom(target.roomId, { type: "remote-media-state", userId: target.id, microphoneEnabled: target.microphoneEnabled, cameraEnabled: target.cameraEnabled, microphoneLocked: target.microphoneLocked, cameraLocked: target.cameraLocked }, target.id);
      sendUserList(); return;
    }
    if (type === "admin-kick") { const target = users.get(String(message.userId || "")); if (!target || target.id === currentUser.id) return; const targetWs = target.ws; removeUserFromRoom(target, true); invalidateUserSessions(target.id); target.ws = null; safeSend(targetWs, { type: "force-lobby", message: "Vous avez été exclu par l'administrateur." }); try { targetWs?.close(4003, "Kicked"); } catch {} sendUserList(); return; }
    if (type === "admin-delete-room") { const roomId = String(message.roomId || ""); const room = rooms.get(roomId); if (!room) return; if (room.permanent) { safeSend(ws, { type: "admin-error", message: "Impossible de supprimer ce salon." }); return; } for (const userId of room.users) { const user = users.get(userId); if (!user) continue; user.roomId = null; user.microphoneEnabled = false; user.cameraEnabled = false; safeSend(user.ws, { type: "room-deleted", roomId }); } rooms.delete(roomId); sendRoomList(); sendUserList(); return; }
    if (type === "admin-refresh") { safeSend(ws, { type: "admin-data", rooms: [...rooms.values()].map(publicRoom), users: [...users.values()].map(publicUser) }); }
  });
  ws.on("close", () => { if (!currentUser || currentUser.ws !== ws) return; const user = currentUser; user.ws = null; user.lastSeenAt = Date.now(); user.microphoneEnabled = false; user.cameraEnabled = false; if (user.roomId) removeUserFromRoom(user, true); sendRoomList(); sendUserList(); });
});
setInterval(() => { const now = Date.now(); for (const [token, session] of sessions) { if (now - session.createdAt <= SESSION_TTL_MS) continue; sessions.delete(token); const user = users.get(session.userId); if (user && !isOnline(user)) users.delete(user.id); } sendRoomList(); sendUserList(); }, 60 * 60 * 1000);
if (!ADMIN_PASSWORD) console.warn("ADMIN_PASSWORD is not configured: administrator login is disabled.");
server.listen(PORT, () => console.log(`Col'inCall signaling server running on port ${PORT}`));