/* =========================================================
   CONFIGURATION
========================================================= */

const CONFIG = {
    websocketUrl: "wss://projet-nz7b.onrender.com"
};


/* =========================================================
   GLOBAL STATE
========================================================= */

let socket = null;

let currentUser = null;
let currentRoom = null;

let users = [];
let onlineUsers = [];
let rooms = [];

let localStream = null;

let microphoneEnabled = false;
let cameraEnabled = false;

let peers = new Map();
let pendingCandidates = new Map();

let roomUnreadCount = 0;

let pendingAvatarUrl = undefined;
let viewingUserId = null;

let currentAdminTab = "users";

let sessionToken =
    localStorage.getItem(
        "colincall_session"
    );


/* =========================================================
   DOM REFERENCES
========================================================= */

const authScreen =
    document.getElementById("authScreen");

const app =
    document.getElementById("app");

const lobbyScreen =
    document.getElementById("lobbyScreen");

const roomScreen =
    document.getElementById("roomScreen");

const lobbyChat =
    document.getElementById("lobbyChat");

const roomChat =
    document.getElementById("roomChat");

const videoGrid =
    document.getElementById("videoGrid");

const mobileChatBackdrop =
    document.getElementById(
        "mobileChatBackdrop"
    );


/* =========================================================
   RESPONSIVE
========================================================= */

function isMobile(){

    return window.innerWidth <= 700;
}


function updateChatButtons(){

    const desktopGeneral =
        document.getElementById(
            "desktopGeneralChatButton"
        );

    const desktopRoom =
        document.getElementById(
            "desktopRoomChatButton"
        );

    const mobileGeneral =
        document.getElementById(
            "generalChatToggle"
        );

    const mobileRoom =
        document.getElementById(
            "roomChatMobileButton"
        );

    const mobile =
        isMobile();


    if(desktopGeneral){

        desktopGeneral.style.display =
            !mobile && !currentRoom
                ? "flex"
                : "none";
    }


    if(desktopRoom){

        desktopRoom.style.display =
            !mobile && currentRoom
                ? "flex"
                : "none";
    }


    if(mobileGeneral){

        mobileGeneral.style.display =
            mobile && !currentRoom
                ? "flex"
                : "none";
    }


    if(mobileRoom){

        mobileRoom.style.display =
            mobile && currentRoom
                ? "flex"
                : "none";
    }
}


/* =========================================================
   UTILS
========================================================= */

function escapeHtml(value){

    return String(value ?? "")
        .replace(/&/g,"&amp;")
        .replace(/</g,"&lt;")
        .replace(/>/g,"&gt;")
        .replace(/"/g,"&quot;")
        .replace(/'/g,"&#039;");
}


function avatarInnerHtml(user){

    if(
        user &&
        user.avatarUrl
    ){

        return `
            <img
                src="${escapeHtml(user.avatarUrl)}"
                alt=""
            >
        `;
    }

    const username =
        user?.username ||
        "?";

    return escapeHtml(
        username
            .trim()
            .charAt(0)
            .toUpperCase() ||
        "?"
    );
}


function findUserById(userId){

    if(!userId) return null;

    if(
        currentUser &&
        currentUser.id === userId
    ){
        return currentUser;
    }

    return (
        users.find(
            user => user.id === userId
        ) ||
        onlineUsers.find(
            user => user.id === userId
        ) ||
        null
    );
}


/* =========================================================
   APPLICATION DISPLAY
========================================================= */

function showApplication(){

    if(authScreen){

        authScreen.style.display =
            "none";
    }

    if(app){

        app.style.display =
            "block";
    }

    updateTopProfile();

    showLobby();

    updateChatButtons();
}


function updateTopProfile(){

    if(!currentUser) return;

    const avatar =
        document.getElementById(
            "topAvatar"
        );

    const username =
        document.getElementById(
            "topUsername"
        );

    const adminButton =
        document.getElementById(
            "adminButton"
        );


    if(avatar){

        avatar.innerHTML =
            avatarInnerHtml(
                currentUser
            );
    }


    if(username){

        username.textContent =
            currentUser.username ||
            "Profil";
    }


    if(adminButton){

        adminButton.style.display =
            currentUser.isAdmin
                ? "flex"
                : "none";
    }
}


/* =========================================================
   WEBSOCKET
========================================================= */

function connectSocket(){

    if(
        socket &&
        (
            socket.readyState ===
                WebSocket.OPEN ||
            socket.readyState ===
                WebSocket.CONNECTING
        )
    ){

        return;
    }


    try{

        socket =
            new WebSocket(
                CONFIG.websocketUrl
            );

    }catch(error){

        console.error(
            "Erreur WebSocket :",
            error
        );

        return;
    }


    socket.addEventListener(
        "open",
        () => {

            console.log(
                "WebSocket connecté"
            );


            if(sessionToken){

                send({
                    type:
                        "restore-session",

                    token:
                        sessionToken
                });
            }

        }
    );


    socket.addEventListener(
        "message",
        event => {

            let message;

            try{

                message =
                    JSON.parse(
                        event.data
                    );

            }catch(error){

                console.error(
                    "Message WebSocket invalide :",
                    event.data
                );

                return;
            }

            handleMessage(
                message
            );
        }
    );


    socket.addEventListener(
        "close",
        () => {

            console.log(
                "WebSocket déconnecté"
            );

            socket = null;
        }
    );


    socket.addEventListener(
        "error",
        error => {

            console.error(
                "WebSocket error :",
                error
            );
        }
    );
}


function send(data){

    if(
        !socket ||
        socket.readyState !==
            WebSocket.OPEN
    ){

        console.warn(
            "WebSocket non connecté",
            data
        );

        return false;
    }

    try{

        socket.send(
            JSON.stringify(data)
        );

        return true;

    }catch(error){

        console.error(
            "Erreur envoi WebSocket :",
            error
        );

        return false;
    }
}


/* =========================================================
   LOGIN
========================================================= */

function login(){

    const usernameInput =
        document.getElementById(
            "usernameInput"
        );

    const passwordInput =
        document.getElementById(
            "passwordInput"
        );

    const errorElement =
        document.getElementById(
            "loginError"
        );


    const username =
        usernameInput
            ?.value
            .trim();

    const password =
        passwordInput
            ?.value
            .trim();


    if(errorElement){

        errorElement.textContent =
            "";
    }


    if(!username){

        if(errorElement){

            errorElement.textContent =
                "Entrez un nom d'utilisateur.";
        }

        return;
    }


    if(!password){

        if(errorElement){

            errorElement.textContent =
                "Entrez le code.";
        }

        return;
    }


    if(
        !socket ||
        socket.readyState !==
            WebSocket.OPEN
    ){

        connectSocket();

        setTimeout(
            () => {

                sendLogin(
                    username,
                    password
                );

            },
            300
        );

        return;
    }


    sendLogin(
        username,
        password
    );
}


function sendLogin(
    username,
    password
){

    send({

        type:"login",

        username,
        password

    });
}


/* =========================================================
   LOGOUT
========================================================= */

function logout(){

    try{

        send({
            type:"logout"
        });

    }catch(error){

        console.error(error);
    }


    closeAllPeers();
    stopLocalMedia();

    currentUser = null;
    currentRoom = null;

    users = [];
    onlineUsers = [];
    rooms = [];

    roomUnreadCount = 0;

    localStorage.removeItem(
        "colincall_session"
    );

    sessionToken = null;


    if(socket){

        try{
            socket.close();
        }catch(error){}
    }

    socket = null;


    if(app){

        app.style.display =
            "none";
    }


    if(authScreen){

        authScreen.style.display =
            "flex";
    }


    const usernameInput =
        document.getElementById(
            "usernameInput"
        );

    const passwordInput =
        document.getElementById(
            "passwordInput"
        );

    const errorElement =
        document.getElementById(
            "loginError"
        );


    if(usernameInput){
        usernameInput.value = "";
    }

    if(passwordInput){
        passwordInput.value = "";
    }

    if(errorElement){
        errorElement.textContent = "";
    }
}


/* =========================================================
   SESSION RESTORE
========================================================= */

function restoreSession(){

    sessionToken =
        localStorage.getItem(
            "colincall_session"
        );


    connectSocket();
}


/* =========================================================
   SERVER MESSAGE ROUTER
========================================================= */

function handleMessage(message){

    if(!message) return;


    console.log(
        "SERVER:",
        message
    );


    switch(message.type){

        /* =================================================
           LOGIN
        ================================================= */

        case "login-success":
        case "login":

            if(message.user){

                currentUser =
                    message.user;
            }

            if(
                message.token
            ){

                sessionToken =
                    message.token;

                localStorage.setItem(
                    "colincall_session",
                    message.token
                );
            }

            showApplication();

            break;


        /* =================================================
           SESSION RESTORE
        ================================================= */

        case "session-restored":
        case "restore-success":

            if(message.user){

                currentUser =
                    message.user;
            }

            if(message.token){

                sessionToken =
                    message.token;

                localStorage.setItem(
                    "colincall_session",
                    message.token
                );
            }

            showApplication();

            break;


        /* =================================================
           LOGIN ERROR
        ================================================= */

        case "login-error":
        case "auth-error":

            {

                const errorElement =
                    document.getElementById(
                        "loginError"
                    );

                if(errorElement){

                    errorElement.textContent =
                        message.message ||
                        "Connexion impossible.";
                }

            }

            break;


        /* =================================================
           SESSION INVALID
        ================================================= */

        case "session-invalid":
        case "restore-error":

            localStorage.removeItem(
                "colincall_session"
            );

            sessionToken = null;

            if(app){

                app.style.display =
                    "none";
            }

            if(authScreen){

                authScreen.style.display =
                    "flex";
            }

            break;


        /* =================================================
           USERS
        ================================================= */

        case "users":
        case "user-list":

            users =
                message.users ||
                [];

            onlineUsers =
                message.users ||
                [];

            renderOnlineUsers();
            renderRooms();
            renderAdmin();

            updateRoomParticipants();

            break;


        case "online-users":
        case "online-users-update":

            onlineUsers =
                message.users ||
                message.onlineUsers ||
                [];

            renderOnlineUsers();

            break;


        /* =================================================
           ROOMS
        ================================================= */

        case "rooms":
        case "room-list":

            rooms =
                message.rooms ||
                [];

            renderRooms();
            renderAdmin();

            break;


        case "room-created":

            if(message.room){

                const exists =
                    rooms.some(
                        room =>
                            room.id ===
                            message.room.id
                    );

                if(!exists){

                    rooms.push(
                        message.room
                    );
                }
            }

            renderRooms();
            renderAdmin();

            break;


        case "room-updated":

            if(message.room){

                const index =
                    rooms.findIndex(
                        room =>
                            room.id ===
                            message.room.id
                    );

                if(index >= 0){

                    rooms[index] =
                        message.room;

                }else{

                    rooms.push(
                        message.room
                    );
                }
            }

            renderRooms();
            renderAdmin();

            break;


        /* =================================================
           ROOM JOIN
        ================================================= */

        case "room-joined":
        case "joined-room":

            handleRoomJoined(
                message
            );

            break;


        case "room-user-joined":
        case "user-joined-room":

            handleRoomUserJoined(
                message
            );

            break;


        case "room-user-left":
        case "user-left-room":

            handleRoomUserLeft(
                message
            );

            break;


        case "room-participants":
        case "participants":

            updateRoomParticipants();

            break;


        /* =================================================
           ROOM DELETE
        ================================================= */

        case "room-deleted":

            handleRoomDeleted(
                message
            );

            break;


        /* =================================================
           WEBRTC
        ================================================= */

        case "offer":

            handleOffer(
                message
            );

            break;


        case "answer":

            handleAnswer(
                message
            );

            break;


        case "candidate":
        case "ice-candidate":

            handleCandidate(
                message
            );

            break;


        /* =================================================
           MEDIA
        ================================================= */

        case "media-state":
        case "remote-media-state":

            handleRemoteMediaState(
                message
            );

            break;


        case "force-media-state":
        case "admin-media-state":

            handleForceMediaState(
                message
            );

            break;


        /* =================================================
           CHAT
        ================================================= */

        case "chat":
        case "chat-message":

            addChatMessage(
                message
            );

            break;


        /* =================================================
           PROFILE
        ================================================= */

        case "profile-updated":
        case "user-profile-updated":

            if(message.user){

                const updatedUser =
                    message.user;


                if(
                    currentUser &&
                    updatedUser.id ===
                        currentUser.id
                ){

                    currentUser =
                        updatedUser;

                    updateTopProfile();
                }


                const userIndex =
                    users.findIndex(
                        user =>
                            user.id ===
                            updatedUser.id
                    );

                if(userIndex >= 0){

                    users[userIndex] =
                        updatedUser;
                }


                const onlineIndex =
                    onlineUsers.findIndex(
                        user =>
                            user.id ===
                            updatedUser.id
                    );

                if(onlineIndex >= 0){

                    onlineUsers[onlineIndex] =
                        updatedUser;
                }


                renderOnlineUsers();

                if(
                    viewingUserId ===
                    updatedUser.id
                ){

                    openUserProfile(
                        updatedUser.id
                    );
                }
            }

            break;


        /* =================================================
           ADMIN REFRESH
        ================================================= */

        case "admin-data":
        case "admin-refresh":

            if(message.users){

                users =
                    message.users;
            }

            if(message.rooms){

                rooms =
                    message.rooms;
            }

            renderAdmin();
            renderRooms();
            renderOnlineUsers();

            break;


        /* =================================================
           ADMIN ACTION RESULT
        ================================================= */

        case "admin-action":

            renderAdmin();
            renderRooms();
            renderOnlineUsers();

            break;


        /* =================================================
           FORCE LEAVE
        ================================================= */

        case "force-leave":
        case "kicked":

            forceLeaveRoom(
                message
            );

            break;


        /* =================================================
           ERROR
        ================================================= */

        case "error":

            console.error(
                "Erreur serveur :",
                message.message
            );

            if(
                !currentUser ||
                !currentUser.id
            ){

                const errorElement =
                    document.getElementById(
                        "loginError"
                    );

                if(errorElement){

                    errorElement.textContent =
                        message.message ||
                        "Une erreur est survenue.";
                }

            }else{

                alert(
                    message.message ||
                    "Une erreur est survenue."
                );
            }

            break;


        default:

            /*
             * Certains messages peuvent être gérés
             * directement par le serveur sans action
             * particulière côté client.
             */

            break;
    }
}


/* =========================================================
   ONLINE USERS
========================================================= */

function renderOnlineUsers(){

    const list =
        document.getElementById(
            "onlineUsersList"
        );

    const count =
        document.getElementById(
            "onlineUsersCount"
        );

    if(!list || !count) return;


    let listUsers =
        [...onlineUsers];


    if(
        currentUser &&
        !listUsers.some(
            user =>
                user.id ===
                currentUser.id
        )
    ){

        listUsers.unshift(
            currentUser
        );
    }


    count.textContent =
        String(
            listUsers.length
        );


    list.innerHTML = "";


    if(!listUsers.length){

        list.innerHTML = `
            <div class="online-empty">
                Aucun utilisateur connecté.
            </div>
        `;

        return;
    }


    listUsers.forEach(
        user => {

            const item =
                document.createElement(
                    "div"
                );

            item.className =
                "online-user";


            item.onclick = () =>
                openUserProfile(
                    user.id
                );


            item.innerHTML = `

                <div class="online-user-avatar">
                    ${avatarInnerHtml(user)}
                </div>

                <div class="online-user-info">

                    <div class="online-user-name">
                        ${escapeHtml(user.username)}
                    </div>

                    <div class="online-user-status">
                        ● En ligne
                    </div>

                </div>
            `;


            list.appendChild(
                item
            );
        }
    );
}


/* =========================================================
   LOBBY
========================================================= */

function showLobby(){

    closeMobileChat();


    lobbyScreen.style.display =
        "flex";

    roomScreen.style.display =
        "none";


    updateChatButtons();

    renderRooms();
    renderOnlineUsers();
}


function renderRooms(){

    const container =
        document.getElementById(
            "roomList"
        );

    const searchInput =
        document.getElementById(
            "roomSearch"
        );


    if(!container) return;


    const search =
        searchInput
            ? searchInput.value
                .trim()
                .toLowerCase()
            : "";


    container.innerHTML = "";


    const filtered =
        rooms.filter(
            room =>
                !search ||
                String(
                    room.name || ""
                )
                .toLowerCase()
                .includes(search)
        );


    if(!filtered.length){

        container.innerHTML = `
            <div style="
                color:var(--muted);
                padding:30px 10px;
                text-align:center;
                grid-column:1/-1;
            ">
                Aucun salon disponible.
            </div>
        `;

        return;
    }


    filtered.forEach(
        room => {

            const card =
                document.createElement(
                    "div"
                );

            card.className =
                "room-card";


            const count =
                room.userCount ??
                room.users?.length ??
                0;


            card.innerHTML = `

                <div class="room-card-top">

                    <div style="min-width:0;">

                        <div class="room-card-name">
                            ${escapeHtml(room.name)}
                        </div>

                        <div class="room-card-count">
                            👥 ${count}
                            participant${count > 1 ? "s" : ""}
                        </div>

                    </div>

                </div>

                <div class="room-card-bottom">

                    <span style="
                        color:var(--muted);
                        font-size:11px;
                    ">
                        Salon
                    </span>

                    <button
                        class="join-room-btn"
                        onclick="joinRoom('${escapeHtml(room.id)}')"
                    >
                        Rejoindre
                    </button>

                </div>
            `;


            container.appendChild(
                card
            );
        }
    );
}


/* =========================================================
   CREATE ROOM
========================================================= */

function createRoom(){

    if(!currentUser) return;


    const name =
        prompt(
            "Nom du salon :"
        );


    if(!name) return;


    const cleanName =
        name.trim();


    if(!cleanName) return;


    send({

        type:"create-room",

        name:cleanName

    });
}


/* =========================================================
   SEARCH
========================================================= */

const roomSearch =
    document.getElementById(
        "roomSearch"
    );

if(roomSearch){

    roomSearch.addEventListener(
        "input",
        renderRooms
    );
}


/* =========================================================
   RESIZE
========================================================= */

window.addEventListener(
    "resize",
    () => {

        if(!currentUser) return;


        updateVideoGridLayout();

        updateChatButtons();

    }
);


/* =========================================================
   INITIALISATION
========================================================= */

restoreSession();
