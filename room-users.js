/* =========================================================
   UTILISATEURS DU SALON
========================================================= */

let roomUsers = [];

function updateRoomUsersMenu(){
    const list = document.getElementById("roomUsersList");
    const count = document.getElementById("roomUsersCount");
    if(!list) return;

    const users = Array.isArray(roomUsers) ? roomUsers : [];
    if(count) count.textContent = users.length;
    list.innerHTML = "";

    users.forEach(user => {
        if(!user) return;

        const row = document.createElement("div");
        row.className = "room-user-row";

        const avatar = document.createElement("div");
        avatar.className = "room-user-avatar";
        avatar.textContent = (user.username || "?").charAt(0).toUpperCase();

        const avatarUrl = user.avatar || user.avatarUrl;
        if(avatarUrl){
            avatar.style.backgroundImage = "url(\"" + avatarUrl + "\")";
            avatar.classList.add("has-image");
            avatar.textContent = "";
        }

        const name = document.createElement("div");
        name.className = "room-user-name";
        name.textContent = user.username || "Utilisateur";

        if(currentUser && user.id === currentUser.id){
            const you = document.createElement("span");
            you.className = "room-user-you";
            you.textContent = "Vous";
            name.appendChild(you);
        }

        const status = document.createElement("span");
        status.className = "room-user-online-dot";
        status.title = "En ligne";

        row.appendChild(avatar);
        row.appendChild(name);
        row.appendChild(status);
        list.appendChild(row);
    });

    if(users.length === 0){
        const empty = document.createElement("div");
        empty.className = "room-users-empty";
        empty.textContent = "Aucun utilisateur";
        list.appendChild(empty);
    }
}

function toggleRoomUsers(){
    const menu = document.getElementById("roomUsersMenu");
    const button = document.getElementById("roomUsersToggle");
    if(!menu) return;

    const isOpen = menu.classList.contains("open");
    menu.classList.toggle("open", !isOpen);
    menu.setAttribute("aria-hidden", isOpen ? "true" : "false");
    if(button) button.classList.toggle("active", !isOpen);
    if(!isOpen) updateRoomUsersMenu();
}

function closeRoomUsers(){
    const menu = document.getElementById("roomUsersMenu");
    const button = document.getElementById("roomUsersToggle");
    if(menu){
        menu.classList.remove("open");
        menu.setAttribute("aria-hidden", "true");
    }
    if(button) button.classList.remove("active");
}

function setRoomUsers(users){
    const incoming = Array.isArray(users) ? [...users] : [];

    /* Le serveur peut exclure l'utilisateur courant. */
    if(currentUser && !incoming.some(user => user && user.id === currentUser.id)){
        incoming.unshift(currentUser);
    }

    roomUsers = incoming;
    updateRoomUsersMenu();
}

function addRoomUser(user){
    if(!user || !user.id) return;
    const exists = roomUsers.some(existing => existing && existing.id === user.id);
    if(!exists) roomUsers.push(user);
    else roomUsers = roomUsers.map(existing => existing && existing.id === user.id ? user : existing);
    updateRoomUsersMenu();
}

function removeRoomUser(userId){
    if(!userId) return;
    roomUsers = roomUsers.filter(user => !user || user.id !== userId);
    updateRoomUsersMenu();
}

if(typeof handleRoomJoined === "function"){
    const originalHandleRoomJoined = handleRoomJoined;
    handleRoomJoined = function(message){
        const participants = message.users || message.participants || [];
        setRoomUsers(participants);
        closeRoomUsers();
        originalHandleRoomJoined(message);
        updateRoomUsersMenu();
    };
}

if(typeof handleRoomUserJoined === "function"){
    const originalHandleRoomUserJoined = handleRoomUserJoined;
    handleRoomUserJoined = function(message){
        const user = message && (message.user || message);
        addRoomUser(user);
        originalHandleRoomUserJoined(message);
    };
}

if(typeof handleRoomUserLeft === "function"){
    const originalHandleRoomUserLeft = handleRoomUserLeft;
    handleRoomUserLeft = function(message){
        const userId = message && (message.userId || (message.user && message.user.id) || message.id);
        removeRoomUser(userId);
        originalHandleRoomUserLeft(message);
    };
}