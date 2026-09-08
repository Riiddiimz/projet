/* =========================================================
   AUTHENTIFICATION UTILISATEUR / ADMINISTRATEUR
   Injecté ici afin de ne pas avoir à modifier index.html.
========================================================= */

(function(){

    const authScreen = document.getElementById("authScreen");
    if(!authScreen) return;

    const card = authScreen.querySelector(".auth-card");
    if(!card) return;

    const form = card.querySelector(".auth-form");
    if(!form) return;

    form.innerHTML = `
        <div id="authChoice" class="auth-form">
            <button type="button" class="primary-btn" id="userModeButton">
                👤 Utilisateur
            </button>
            <button type="button" class="secondary-btn" id="adminModeButton">
                🛡️ Administrateur
            </button>
        </div>

        <div id="userLoginForm" class="auth-form" style="display:none;">
            <input id="userUsernameInput" type="text" placeholder="Nom d'utilisateur" autocomplete="username">
            <button type="button" class="primary-btn" id="userLoginButton">
                Se connecter
            </button>
            <button type="button" class="secondary-btn" id="userBackButton">
                ← Retour
            </button>
            <div id="userLoginError" class="login-error"></div>
        </div>

        <div id="adminLoginForm" class="auth-form" style="display:none;">
            <input id="adminUsernameInput" type="text" placeholder="Nom d'administrateur" autocomplete="username">
            <input id="adminPasswordInput" type="password" placeholder="Code administrateur" autocomplete="current-password">
            <button type="button" class="primary-btn" id="adminLoginButton">
                Se connecter
            </button>
            <button type="button" class="secondary-btn" id="adminBackButton">
                ← Retour
            </button>
            <div id="adminLoginError" class="login-error"></div>
        </div>
    `;

    const choice = document.getElementById("authChoice");
    const userForm = document.getElementById("userLoginForm");
    const adminForm = document.getElementById("adminLoginForm");
    const userInput = document.getElementById("userUsernameInput");
    const adminInput = document.getElementById("adminUsernameInput");
    const adminPassword = document.getElementById("adminPasswordInput");
    const userError = document.getElementById("userLoginError");
    const adminError = document.getElementById("adminLoginError");

    let authMode = null;

    function showMode(mode){
        authMode = mode;

        if(choice) choice.style.display = "none";
        if(userForm) userForm.style.display = mode === "user" ? "flex" : "none";
        if(adminForm) adminForm.style.display = mode === "admin" ? "flex" : "none";

        if(userError) userError.textContent = "";
        if(adminError) adminError.textContent = "";

        setTimeout(() => {
            if(mode === "user") userInput?.focus();
            if(mode === "admin") adminInput?.focus();
        }, 0);
    }

    function backToChoice(){
        authMode = null;

        if(choice) choice.style.display = "flex";
        if(userForm) userForm.style.display = "none";
        if(adminForm) adminForm.style.display = "none";

        if(userInput) userInput.value = "";
        if(adminInput) adminInput.value = "";
        if(adminPassword) adminPassword.value = "";
        if(userError) userError.textContent = "";
        if(adminError) adminError.textContent = "";
    }

    function submitLogin(username, password, isAdmin, errorElement){

        if(
            typeof socket !== "undefined" &&
            socket &&
            socket.readyState === WebSocket.OPEN
        ){
            send({
                type: "login",
                username,
                password,
                isAdmin
            });
            return;
        }

        const sendAfterOpen = () => {
            send({
                type: "login",
                username,
                password,
                isAdmin
            });
        };

        if(
            typeof socket !== "undefined" &&
            socket &&
            socket.readyState === WebSocket.CONNECTING
        ){
            socket.addEventListener("open", sendAfterOpen, {once:true});
            return;
        }

        if(typeof connectSocket === "function"){
            connectSocket();

            if(
                typeof socket !== "undefined" &&
                socket
            ){
                socket.addEventListener("open", sendAfterOpen, {once:true});
            }else if(errorElement){
                errorElement.textContent = "Impossible de contacter le serveur.";
            }
        }
    }

    function loginUser(){
        const username = userInput?.value.trim();

        if(userError) userError.textContent = "";

        if(!username){
            if(userError) userError.textContent = "Entrez un nom d'utilisateur.";
            return;
        }

        submitLogin(username, "", false, userError);
    }

    function loginAdmin(){
        const username = adminInput?.value.trim();
        const password = adminPassword?.value.trim();

        if(adminError) adminError.textContent = "";

        if(!username){
            if(adminError) adminError.textContent = "Entrez le nom d'administrateur.";
            return;
        }

        if(!password){
            if(adminError) adminError.textContent = "Entrez le code administrateur.";
            return;
        }

        submitLogin(username, password, true, adminError);
    }

    document.getElementById("userModeButton")?.addEventListener("click", () => showMode("user"));
    document.getElementById("adminModeButton")?.addEventListener("click", () => showMode("admin"));
    document.getElementById("userLoginButton")?.addEventListener("click", loginUser);
    document.getElementById("adminLoginButton")?.addEventListener("click", loginAdmin);
    document.getElementById("userBackButton")?.addEventListener("click", backToChoice);
    document.getElementById("adminBackButton")?.addEventListener("click", backToChoice);

    userInput?.addEventListener("keydown", event => {
        if(event.key === "Enter") loginUser();
    });

    adminInput?.addEventListener("keydown", event => {
        if(event.key === "Enter") adminPassword?.focus();
    });

    adminPassword?.addEventListener("keydown", event => {
        if(event.key === "Enter") loginAdmin();
    });

})();


/* =========================================================
   ADMIN
========================================================= */

function openAdmin(){
    if(!currentUser || !currentUser.isAdmin) return;

    currentAdminTab = "users";
    renderAdmin();

    const modal = document.getElementById("adminModal");
    if(modal) modal.style.display = "flex";
}

function closeAdmin(){
    const modal = document.getElementById("adminModal");
    if(modal) modal.style.display = "none";
}

function switchAdminTab(tab){
    currentAdminTab = tab;
    renderAdmin();
}

function renderAdmin(){
    const container = document.getElementById("adminList");
    if(!container) return;

    if(currentAdminTab === "users"){
        renderAdminUsers(container);
        return;
    }

    if(currentAdminTab === "rooms"){
        renderAdminRooms(container);
        return;
    }

    container.innerHTML = "";
}

function renderAdminUsers(container){
    container.innerHTML = "";

    if(!users || users.length === 0){
        container.innerHTML = `
            <div class="empty-state">
                Aucun utilisateur.
            </div>
        `;
        return;
    }

    users.forEach(user => {
        const row = document.createElement("div");
        row.className = "admin-row";

        const info = document.createElement("div");
        info.className = "admin-user-info";

        const avatar = document.createElement("div");
        avatar.className = "admin-user-avatar";

        if(typeof avatarInnerHtml === "function"){
            avatar.innerHTML = avatarInnerHtml(user);
        }else{
            avatar.textContent = "👤";
        }

        const text = document.createElement("div");

        const name = document.createElement("div");
        name.className = "admin-user-name";
        name.textContent = user.username || "Utilisateur";

        const status = document.createElement("div");
        status.className = "admin-user-status";
        status.textContent = user.online ? "En ligne" : "Hors ligne";

        text.appendChild(name);
        text.appendChild(status);
        info.appendChild(avatar);
        info.appendChild(text);

        const actions = document.createElement("div");
        actions.className = "admin-actions";

        if(currentUser && user.id !== currentUser.id && !user.isAdmin){
            const muteButton = document.createElement("button");
            muteButton.className = "admin-action-btn";
            muteButton.textContent = "🔇";
            muteButton.title = "Couper le micro";
            muteButton.onclick = () => adminMute(user.id);

            const cameraButton = document.createElement("button");
            cameraButton.className = "admin-action-btn";
            cameraButton.textContent = "📹";
            cameraButton.title = "Couper la caméra";
            cameraButton.onclick = () => adminCamera(user.id);

            const kickButton = document.createElement("button");
            kickButton.className = "admin-action-btn danger";
            kickButton.textContent = "⛔";
            kickButton.title = "Expulser";
            kickButton.onclick = () => adminKick(user.id);

            actions.appendChild(muteButton);
            actions.appendChild(cameraButton);
            actions.appendChild(kickButton);
        }

        row.appendChild(info);
        row.appendChild(actions);
        container.appendChild(row);
    });
}

function renderAdminRooms(container){
    container.innerHTML = "";

    if(!rooms || rooms.length === 0){
        container.innerHTML = `
            <div class="empty-state">
                Aucun salon.
            </div>
        `;
        return;
    }

    rooms.forEach(room => {
        const row = document.createElement("div");
        row.className = "admin-row";

        const info = document.createElement("div");
        info.className = "admin-user-info";

        const icon = document.createElement("div");
        icon.className = "admin-user-avatar";
        icon.textContent = "🏠";

        const text = document.createElement("div");

        const name = document.createElement("div");
        name.className = "admin-user-name";
        name.textContent = room.name || "Salon";

        const count = document.createElement("div");
        count.className = "admin-user-status";

        const usersCount =
            room.usersCount ??
            room.userCount ??
            room.users?.length ??
            0;

        count.textContent = usersCount + " participant(s)";

        text.appendChild(name);
        text.appendChild(count);
        info.appendChild(icon);
        info.appendChild(text);

        const actions = document.createElement("div");
        actions.className = "admin-actions";

        const deleteButton = document.createElement("button");
        deleteButton.className = "admin-action-btn danger";
        deleteButton.textContent = "🗑️";
        deleteButton.title = "Supprimer le salon";
        deleteButton.onclick = () => adminDeleteRoom(room.id);

        actions.appendChild(deleteButton);
        row.appendChild(info);
        row.appendChild(actions);
        container.appendChild(row);
    });
}

function adminMute(userId){
    if(!userId) return;
    send({type:"admin-mute", userId});
}

function adminCamera(userId){
    if(!userId) return;
    send({type:"admin-camera", userId});
}

function adminKick(userId){
    if(!userId) return;

    const user =
        typeof findUserById === "function"
            ? findUserById(userId)
            : null;

    const username =
        user && user.username
            ? user.username
            : "cet utilisateur";

    const confirmed = confirm(
        `Voulez-vous vraiment expulser ${username} ?`
    );

    if(!confirmed) return;

    send({type:"admin-kick", userId});
}

function adminDeleteRoom(roomId){
    if(!roomId) return;

    const room = rooms.find(item => item.id === roomId);

    const roomName =
        room && room.name
            ? room.name
            : "ce salon";

    const confirmed = confirm(
        `Voulez-vous vraiment supprimer ${roomName} ?`
    );

    if(!confirmed) return;

    send({type:"admin-delete-room", roomId});
}

function closeModalOutside(event, modalId){
    if(!event) return;

    if(!modalId){
        if(event.target === document.getElementById("profileModal")){
            closeProfile();
            return;
        }

        if(event.target === document.getElementById("userProfileModal")){
            closeUserProfile();
            return;
        }

        if(event.target === document.getElementById("adminModal")){
            closeAdmin();
            return;
        }

        return;
    }

    if(event.target.id !== modalId) return;

    if(modalId === "profileModal"){
        closeProfile();
        return;
    }

    if(modalId === "userProfileModal"){
        closeUserProfile();
        return;
    }

    if(modalId === "adminModal"){
        closeAdmin();
    }
}
