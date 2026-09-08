/* =========================================================
   CHAT
========================================================= */

function sendLobbyChat(){

    const input =
        document.getElementById(
            "lobbyChatInput"
        );

    if(!input) return;

    const text =
        input.value.trim();

    if(!text) return;

    send({
        type:"chat",
        text,
        roomId:null
    });

    input.value = "";
}


function sendRoomChat(){

    if(!currentRoom) return;

    const input =
        document.getElementById(
            "roomChatInput"
        );

    if(!input) return;

    const text =
        input.value.trim();

    if(!text) return;

    send({
        type:"chat",
        text,
        roomId:
            currentRoom.id
    });

    input.value = "";
}


function addChatMessage(message){

    const isRoomMessage =
        !!message.roomId;

    /* =====================================================
       CHAT DU SALON
    ===================================================== */

    if(isRoomMessage){

        const isMine =
            currentUser &&
            message.userId ===
                currentUser.id;

        const chatOpen =
            roomChat.classList.contains(
                "mobile-open"
            );

        appendChatMessage(
            document.getElementById(
                "roomChatMessages"
            ),
            message
        );

        /*
         * Si le message vient d'un autre utilisateur
         * et que le chat n'est pas ouvert,
         * on augmente le compteur.
         */
        if(
            !isMine &&
            !chatOpen &&
            currentRoom &&
            message.roomId ===
                currentRoom.id
        ){

            roomUnreadCount++;

            updateRoomUnreadBadge();
        }

        return;
    }


    /* =====================================================
       CHAT GENERAL
    ===================================================== */

    appendChatMessage(
        document.getElementById(
            "lobbyChatMessages"
        ),
        message
    );
}


function appendChatMessage(
    container,
    message
){

    if(!container) return;

    const row =
        document.createElement("div");

    row.className =
        "chat-message";


    if(
        currentUser &&
        message.userId ===
            currentUser.id
    ){

        row.classList.add(
            "mine"
        );
    }


    const author =
        document.createElement("div");

    author.className =
        "chat-message-author";

    author.textContent =
        message.username ||
        (
            message.user &&
            message.user.username
        ) ||
        "Utilisateur";


    const body =
        document.createElement("div");

    body.className =
        "chat-message-body";

    body.textContent =
        message.text || "";


    row.appendChild(author);
    row.appendChild(body);

    container.appendChild(row);


    /*
     * Toujours descendre automatiquement
     * sur le dernier message.
     */
    container.scrollTop =
        container.scrollHeight;
}


/* =========================================================
   BADGE MESSAGES NON LUS
========================================================= */

function updateRoomUnreadBadge(){

    const count =
        roomUnreadCount;

    /*
     * Badge mobile
     */
    const mobileBadge =
        document.getElementById(
            "roomChatUnread"
        );

    /*
     * Badge desktop
     */
    const desktopBadge =
        document.getElementById(
            "desktopRoomChatUnread"
        );

    const badges = [
        mobileBadge,
        desktopBadge
    ];

    const text =
        count > 99
            ? "99+"
            : String(count);


    badges.forEach(
        badge => {

            if(!badge) return;

            badge.textContent =
                text;

            badge.classList.toggle(
                "visible",
                count > 0
            );
        }
    );
}


/* =========================================================
   CHAT GENERAL
========================================================= */

function toggleLobbyChat(){

    const isOpen =
        lobbyChat.classList.contains(
            "mobile-open"
        );


    closeMobileChat();


    if(!isOpen){

        lobbyChat.classList.add(
            "mobile-open"
        );


        if(isMobile()){

            mobileChatBackdrop.classList.add(
                "visible"
            );
        }


        setTimeout(
            () => {

                const input =
                    document.getElementById(
                        "lobbyChatInput"
                    );

                if(input){

                    input.focus();
                }

            },
            80
        );
    }
}


function closeGeneralChat(){

    lobbyChat.classList.remove(
        "mobile-open"
    );

    mobileChatBackdrop.classList.remove(
        "visible"
    );
}


/* =========================================================
   CHAT DU SALON
========================================================= */

function toggleRoomChat(){

    if(!currentRoom) return;


    const isOpen =
        roomChat.classList.contains(
            "mobile-open"
        );


    closeMobileChat();


    if(!isOpen){

        roomChat.classList.add(
            "mobile-open"
        );


        if(isMobile()){

            mobileChatBackdrop.classList.add(
                "visible"
            );
        }


        /*
         * Dès que le chat est ouvert,
         * les messages sont considérés comme lus.
         */
        roomUnreadCount = 0;

        updateRoomUnreadBadge();


        setTimeout(
            () => {

                const input =
                    document.getElementById(
                        "roomChatInput"
                    );

                if(input){

                    input.focus();
                }

            },
            80
        );
    }
}


function closeRoomChat(){

    roomChat.classList.remove(
        "mobile-open"
    );

    mobileChatBackdrop.classList.remove(
        "visible"
    );
}


/* =========================================================
   FERMETURE DES CHATS MOBILES
========================================================= */

function closeMobileChat(){

    lobbyChat.classList.remove(
        "mobile-open"
    );

    roomChat.classList.remove(
        "mobile-open"
    );

    mobileChatBackdrop.classList.remove(
        "visible"
    );
}


/* =========================================================
   INPUT CHAT GENERAL
========================================================= */

const lobbyChatInputElement =
    document.getElementById(
        "lobbyChatInput"
    );

if(lobbyChatInputElement){

    lobbyChatInputElement.addEventListener(
        "keydown",
        event => {

            if(event.key === "Enter"){

                event.preventDefault();

                sendLobbyChat();
            }
        }
    );
}


/* =========================================================
   INPUT CHAT SALON
========================================================= */

const roomChatInputElement =
    document.getElementById(
        "roomChatInput"
    );

if(roomChatInputElement){

    roomChatInputElement.addEventListener(
        "keydown",
        event => {

            if(event.key === "Enter"){

                event.preventDefault();

                sendRoomChat();
            }
        }
    );
}
