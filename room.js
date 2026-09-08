/* =========================================================
   ROOM / VIDEO / WEBRTC
========================================================= */


/* =========================================================
   REJOINDRE UN SALON
========================================================= */

async function joinRoom(roomId){

    if(!currentUser) return;

    closeMobileChat();

    const ready =
        await prepareLocalMedia();

    if(!ready) return;

    send({
        type:"join-room",
        roomId
    });
}


/* =========================================================
   MEDIA LOCAL
========================================================= */

async function prepareLocalMedia(){

    try{

        if(localStream){

            localStream
                .getTracks()
                .forEach(track => {

                    track.stop();

                });

            localStream = null;
        }


        localStream =
            await navigator.mediaDevices.getUserMedia({
                audio:true,
                video:true
            });


        microphoneEnabled = true;
        cameraEnabled = true;


        return true;

    }catch(error){

        console.error(
            "Impossible d'accéder au micro/caméra :",
            error
        );


        /*
         * Si l'utilisateur refuse la caméra,
         * on essaye au moins le micro.
         */

        try{

            localStream =
                await navigator.mediaDevices.getUserMedia({
                    audio:true,
                    video:false
                });


            microphoneEnabled = true;
            cameraEnabled = false;


            return true;

        }catch(secondError){

            console.error(
                "Impossible d'accéder au micro :",
                secondError
            );


            alert(
                "L'accès au microphone et à la caméra est nécessaire pour rejoindre un salon."
            );


            return false;
        }
    }
}


/* =========================================================
   SALON REJOINT
========================================================= */

function handleRoomJoined(message){

    currentRoom =
        message.room;


    roomUnreadCount = 0;

    updateRoomUnreadBadge();

    closeMobileChat();


    lobbyScreen.style.display =
        "none";

    roomScreen.style.display =
        "flex";


    /*
     * Le bouton Général mobile disparaît
     * lorsqu'on est dans un salon.
     */

    const generalButton =
        document.getElementById(
            "generalChatToggle"
        );


    if(generalButton){

        generalButton.style.display =
            "none";
    }


    const roomNameElement =
        document.getElementById(
            "roomName"
        );


    if(roomNameElement){

        roomNameElement.textContent =
            currentRoom.name ||
            "Salon";
    }


    const roomStatusElement =
        document.getElementById(
            "roomStatus"
        );


    if(roomStatusElement){

        roomStatusElement.textContent =
            "Vous êtes connecté";
    }


    const roomMessages =
        document.getElementById(
            "roomChatMessages"
        );


    if(roomMessages){

        roomMessages.innerHTML = "";
    }


    videoGrid.innerHTML = "";

    closeAllPeers();

    addLocalVideo();


    /*
     * Le serveur peut utiliser "users" ou
     * "participants".
     */

    const participants =
        message.users ||
        message.participants ||
        [];


    participants.forEach(
        user => {

            if(
                currentUser &&
                user.id ===
                    currentUser.id
            ){

                return;
            }


            addVideoUser(user);

            createOfferForUser(user);
        }
    );


    updateVideoGridLayout();

    updateChatButtons();
}


/* =========================================================
   VIDEO LOCAL
========================================================= */

function addLocalVideo(){

    if(!videoGrid) return;

    if(!currentUser) return;


    const wrapper =
        document.createElement(
            "div"
        );


    wrapper.className =
        "video-card";


    wrapper.id =
        "video-user-" +
        currentUser.id;


    const video =
        document.createElement(
            "video"
        );


    video.autoplay = true;

    video.playsInline = true;

    video.muted = true;


    if(localStream){

        video.srcObject =
            localStream;
    }


    const overlay =
        document.createElement(
            "div"
        );


    overlay.className =
        "video-overlay";


    const name =
        document.createElement(
            "span"
        );


    name.textContent =
        currentUser.username ||
        "Vous";


    const state =
        document.createElement(
            "span"
        );


    state.className =
        "video-media-state";


    overlay.appendChild(name);

    overlay.appendChild(state);

    wrapper.appendChild(video);

    wrapper.appendChild(overlay);

    videoGrid.appendChild(wrapper);


    updateLocalCameraDisplay();


    updateControlButton(
        "microBtn",
        microphoneEnabled,
        "🎙️",
        "🔇"
    );


    updateControlButton(
        "cameraBtn",
        cameraEnabled,
        "📹",
        "🚫"
    );
}


/* =========================================================
   AJOUT VIDEO UTILISATEUR
========================================================= */

function addVideoUser(user){

    if(!user || !videoGrid) return;


    const existing =
        document.getElementById(
            "video-user-" +
            user.id
        );


    if(existing) return;


    const wrapper =
        document.createElement(
            "div"
        );


    wrapper.className =
        "video-card";


    wrapper.id =
        "video-user-" +
        user.id;


    const video =
        document.createElement(
            "video"
        );


    video.autoplay = true;

    video.playsInline = true;


    const overlay =
        document.createElement(
            "div"
        );


    overlay.className =
        "video-overlay";


    const name =
        document.createElement(
            "span"
        );


    name.textContent =
        user.username ||
        "Utilisateur";


    const state =
        document.createElement(
            "span"
        );


    state.className =
        "video-media-state";


    overlay.appendChild(name);

    overlay.appendChild(state);


    wrapper.appendChild(video);

    wrapper.appendChild(overlay);

    videoGrid.appendChild(wrapper);
}


/* =========================================================
   LAYOUT VIDEO
========================================================= */

function updateVideoGridLayout(){

    if(!videoGrid) return;


    const count =
        videoGrid.children.length;


    videoGrid.classList.remove(
        "count-one",
        "count-two",
        "count-many"
    );


    if(count <= 1){

        videoGrid.classList.add(
            "count-one"
        );

    }else if(count === 2){

        videoGrid.classList.add(
            "count-two"
        );

    }else{

        videoGrid.classList.add(
            "count-many"
        );
    }
}


/* =========================================================
   CAMERA LOCALE
========================================================= */

function updateLocalCameraDisplay(){

    if(!currentUser) return;


    const card =
        document.getElementById(
            "video-user-" +
            currentUser.id
        );


    if(!card) return;


    const video =
        card.querySelector(
            "video"
        );


    const state =
        card.querySelector(
            ".video-media-state"
        );


    if(video){

        video.style.display =
            cameraEnabled
                ? "block"
                : "none";
    }


    if(state){

        state.textContent =
            cameraEnabled
                ? ""
                : "📷 Caméra désactivée";
    }
}


/* =========================================================
   CAMERA DISTANTE
========================================================= */

function updateRemoteCameraDisplay(
    userId,
    enabled
){

    const card =
        document.getElementById(
            "video-user-" +
            userId
        );


    if(!card) return;


    const video =
        card.querySelector(
            "video"
        );


    const state =
        card.querySelector(
            ".video-media-state"
        );


    if(video){

        video.style.display =
            enabled
                ? "block"
                : "none";
    }


    if(state){

        state.textContent =
            enabled
                ? ""
                : "📷 Caméra désactivée";
    }
}


/* =========================================================
   PARTICIPANTS
========================================================= */

function updateRoomParticipants(){

    if(!currentRoom) return;


    updateVideoGridLayout();
}


/* =========================================================
   UTILISATEUR ENTRE DANS LE SALON
========================================================= */

function handleRoomUserJoined(message){

    const user =
        message.user ||
        message;


    if(!user || !user.id) return;


    if(
        currentUser &&
        user.id === currentUser.id
    ){

        return;
    }


    addVideoUser(user);

    updateVideoGridLayout();

    createOfferForUser(user);
}


/* =========================================================
   UTILISATEUR QUITTE LE SALON
========================================================= */

function handleRoomUserLeft(message){

    const userId =
        message.userId ||
        (
            message.user &&
            message.user.id
        ) ||
        message.id;


    if(!userId) return;


    const card =
        document.getElementById(
            "video-user-" +
            userId
        );


    if(card){

        card.remove();
    }


    closePeer(userId);

    updateVideoGridLayout();
}


/* =========================================================
   PEER CONNECTION
========================================================= */

function createPeerConnection(userId){

    if(peers.has(userId)){

        return peers.get(userId);
    }


    const configuration = {

        iceServers:[

            {
                urls:[
                    "stun:stun.l.google.com:19302",
                    "stun:stun1.l.google.com:19302"
                ]
            }

        ]

    };


    const peer =
        new RTCPeerConnection(
            configuration
        );


    peers.set(
        userId,
        peer
    );


    pendingCandidates.set(
        userId,
        []
    );


    /*
     * Ajout des pistes locales.
     */

    if(localStream){

        localStream
            .getTracks()
            .forEach(
                track => {

                    peer.addTrack(
                        track,
                        localStream
                    );

                }
            );
    }


    /*
     * Piste distante.
     */

    peer.ontrack =
        event => {

            const card =
                document.getElementById(
                    "video-user-" +
                    userId
                );


            if(!card) return;


            const video =
                card.querySelector(
                    "video"
                );


            if(!video) return;


            if(
                event.streams &&
                event.streams[0]
            ){

                video.srcObject =
                    event.streams[0];
            }
        };


    /*
     * ICE candidate.
     *
     * Le serveur attend "targetId".
     */

    peer.onicecandidate =
        event => {

            if(!event.candidate) return;


            send({

                type:"candidate",

                targetId:
                    userId,

                candidate:
                    event.candidate

            });
        };


    /*
     * Connexion.
     */

    peer.onconnectionstatechange =
        () => {

            const state =
                peer.connectionState;


            if(
                state === "failed" ||
                state === "closed"
            ){

                closePeer(userId);
            }
        };


    return peer;
}


/* =========================================================
   CREER UNE OFFER
========================================================= */

async function createOfferForUser(user){

    if(!user || !user.id) return;


    try{

        const peer =
            createPeerConnection(
                user.id
            );


        const offer =
            await peer.createOffer();


        await peer.setLocalDescription(
            offer
        );


        /*
         * Le serveur attend "targetId".
         */

        send({

            type:"offer",

            targetId:
                user.id,

            offer

        });

    }catch(error){

        console.error(
            "Erreur création offer :",
            error
        );
    }
}


/* =========================================================
   OFFER
========================================================= */

async function handleOffer(message){

    /*
     * Le serveur renvoie l'expéditeur
     * dans "fromId".
     */

    const userId =
        message.fromId ||
        message.userId ||
        message.fromUserId ||
        message.senderId;


    if(!userId) return;


    try{

        const peer =
            createPeerConnection(
                userId
            );


        await peer.setRemoteDescription(
            new RTCSessionDescription(
                message.offer
            )
        );


        await flushCandidates(
            userId
        );


        const answer =
            await peer.createAnswer();


        await peer.setLocalDescription(
            answer
        );


        /*
         * Le serveur attend "targetId".
         */

        send({

            type:"answer",

            targetId:
                userId,

            answer

        });

    }catch(error){

        console.error(
            "Erreur traitement offer :",
            error
        );
    }
}


/* =========================================================
   ANSWER
========================================================= */

async function handleAnswer(message){

    /*
     * Le serveur renvoie l'expéditeur
     * dans "fromId".
     */

    const userId =
        message.fromId ||
        message.userId ||
        message.fromUserId ||
        message.senderId;


    if(!userId) return;


    const peer =
        peers.get(
            userId
        );


    if(!peer) return;


    try{

        await peer.setRemoteDescription(
            new RTCSessionDescription(
                message.answer
            )
        );


        await flushCandidates(
            userId
        );

    }catch(error){

        console.error(
            "Erreur traitement answer :",
            error
        );
    }
}


/* =========================================================
   ICE CANDIDATE
========================================================= */

async function handleCandidate(message){

    /*
     * Le serveur renvoie l'expéditeur
     * dans "fromId".
     */

    const userId =
        message.fromId ||
        message.userId ||
        message.fromUserId ||
        message.senderId;


    if(!userId) return;


    const peer =
        peers.get(
            userId
        );


    /*
     * Si le peer n'est pas encore prêt,
     * on garde le candidate en mémoire.
     */

    if(
        !peer ||
        !peer.remoteDescription
    ){

        if(
            !pendingCandidates.has(
                userId
            )
        ){

            pendingCandidates.set(
                userId,
                []
            );
        }


        if(message.candidate){

            pendingCandidates
                .get(userId)
                .push(
                    message.candidate
                );
        }


        return;
    }


    try{

        if(!message.candidate) return;


        await peer.addIceCandidate(
            new RTCIceCandidate(
                message.candidate
            )
        );

    }catch(error){

        console.error(
            "Erreur ICE candidate :",
            error
        );
    }
}


/* =========================================================
   CANDIDATES EN ATTENTE
========================================================= */

async function flushCandidates(userId){

    const peer =
        peers.get(
            userId
        );


    if(!peer) return;


    const candidates =
        pendingCandidates.get(
            userId
        ) || [];


    for(
        const candidate of candidates
    ){

        try{

            await peer.addIceCandidate(
                new RTCIceCandidate(
                    candidate
                )
            );

        }catch(error){

            console.error(
                "Erreur ajout candidate :",
                error
            );
        }
    }


    pendingCandidates.set(
        userId,
        []
    );
}


/* =========================================================
   FERMER UN PEER
========================================================= */

function closePeer(userId){

    const peer =
        peers.get(
            userId
        );


    if(peer){

        try{

            peer.close();

        }catch(error){

            console.error(error);
        }
    }


    peers.delete(
        userId
    );


    pendingCandidates.delete(
        userId
    );
}


/* =========================================================
   FERMER TOUS LES PEERS
========================================================= */

function closeAllPeers(){

    peers.forEach(
        peer => {

            try{

                peer.close();

            }catch(error){

                console.error(error);
            }
        }
    );


    peers.clear();

    pendingCandidates.clear();
}


/* =========================================================
   MICRO
========================================================= */

function toggleMicro(){

    if(!localStream) return;


    microphoneEnabled =
        !microphoneEnabled;


    localStream
        .getAudioTracks()
        .forEach(
            track => {

                track.enabled =
                    microphoneEnabled;
            }
        );


    /*
     * L'ID réel dans index.html est "microBtn".
     */

    updateControlButton(
        "microBtn",
        microphoneEnabled,
        "🎙️",
        "🔇"
    );


    /*
     * Le serveur attend :
     * microphoneEnabled
     * cameraEnabled
     */

    send({

        type:"media-state",

        microphoneEnabled:
            microphoneEnabled,

        cameraEnabled:
            cameraEnabled

    });
}


/* =========================================================
   CAMERA
========================================================= */

function toggleCamera(){

    if(!localStream) return;


    cameraEnabled =
        !cameraEnabled;


    localStream
        .getVideoTracks()
        .forEach(
            track => {

                track.enabled =
                    cameraEnabled;
            }
        );


    updateLocalCameraDisplay();


    /*
     * L'ID réel dans index.html est "cameraBtn".
     */

    updateControlButton(
        "cameraBtn",
        cameraEnabled,
        "📹",
        "🚫"
    );


    /*
     * Le serveur attend :
     * microphoneEnabled
     * cameraEnabled
     */

    send({

        type:"media-state",

        microphoneEnabled:
            microphoneEnabled,

        cameraEnabled:
            cameraEnabled

    });
}


/* =========================================================
   BOUTON MEDIA
========================================================= */

function updateControlButton(
    elementId,
    enabled,
    enabledIcon,
    disabledIcon
){

    const button =
        document.getElementById(
            elementId
        );


    if(!button) return;


    button.textContent =
        enabled
            ? enabledIcon
            : disabledIcon;


    button.classList.toggle(
        "disabled",
        !enabled
    );
}


/* =========================================================
   ETAT MEDIA DISTANT
========================================================= */

function handleRemoteMediaState(
    message
){

    /*
     * Le serveur utilise "userId".
     *
     * On accepte aussi fromId pour
     * rester compatible avec d'autres
     * messages éventuels.
     */

    const userId =
        message.userId ||
        message.fromId ||
        message.fromUserId ||
        message.senderId;


    if(!userId) return;


    /*
     * Le serveur envoie "cameraEnabled".
     */

    const videoEnabled =
        message.cameraEnabled !== false;


    updateRemoteCameraDisplay(
        userId,
        videoEnabled
    );
}


/* =========================================================
   FORCER L'ETAT MEDIA
========================================================= */

function handleForceMediaState(message){

    if(!localStream) return;


    /*
     * Le serveur utilise :
     *
     * microphoneEnabled
     * cameraEnabled
     */

    if(
        typeof message.microphoneEnabled ===
        "boolean"
    ){

        microphoneEnabled =
            message.microphoneEnabled;


        localStream
            .getAudioTracks()
            .forEach(
                track => {

                    track.enabled =
                        microphoneEnabled;
                }
            );
    }


    if(
        typeof message.cameraEnabled ===
        "boolean"
    ){

        cameraEnabled =
            message.cameraEnabled;


        localStream
            .getVideoTracks()
            .forEach(
                track => {

                    track.enabled =
                        cameraEnabled;
                }
            );
    }


    updateControlButton(
        "microBtn",
        microphoneEnabled,
        "🎙️",
        "🔇"
    );


    updateControlButton(
        "cameraBtn",
        cameraEnabled,
        "📹",
        "🚫"
    );


    updateLocalCameraDisplay();
}


/* =========================================================
   STOP MEDIA LOCAL
========================================================= */

function stopLocalMedia(){

    if(localStream){

        localStream
            .getTracks()
            .forEach(
                track => {

                    try{

                        track.stop();

                    }catch(error){

                        console.error(error);
                    }
                }
            );
    }


    localStream = null;

    microphoneEnabled = false;

    cameraEnabled = false;
}


/* =========================================================
   QUITTER LE SALON
========================================================= */

function leaveCurrentRoom(){

    if(!currentRoom) return;


    send({

        type:"leave-room",

        roomId:
            currentRoom.id

    });


    closeAllPeers();

    stopLocalMedia();


    if(videoGrid){

        videoGrid.innerHTML = "";
    }


    currentRoom = null;

    roomUnreadCount = 0;

    updateRoomUnreadBadge();


    roomScreen.style.display =
        "none";


    lobbyScreen.style.display =
        "flex";


    closeMobileChat();

    updateChatButtons();


    renderRooms();

    renderOnlineUsers();
}


/* =========================================================
   SORTIE FORCEE
========================================================= */

function forceLeaveRoom(message){

    closeAllPeers();

    stopLocalMedia();


    if(videoGrid){

        videoGrid.innerHTML = "";
    }


    currentRoom = null;

    roomUnreadCount = 0;

    updateRoomUnreadBadge();


    roomScreen.style.display =
        "none";


    lobbyScreen.style.display =
        "flex";


    closeMobileChat();

    updateChatButtons();


    renderRooms();

    renderOnlineUsers();


    /*
     * Le serveur utilise actuellement
     * "message" pour transmettre le texte.
     * On accepte également "reason".
     */

    const reason =
        message?.message ||
        message?.reason;


    if(reason){

        alert(
            reason
        );
    }
}


/* =========================================================
   SALON SUPPRIME
========================================================= */

function handleRoomDeleted(message){

    if(!currentRoom){

        renderRooms();

        return;
    }


    const deletedRoomId =
        message.roomId ||
        (
            message.room &&
            message.room.id
        );


    if(
        deletedRoomId &&
        currentRoom.id !==
            deletedRoomId
    ){

        renderRooms();

        return;
    }


    closeAllPeers();

    stopLocalMedia();


    if(videoGrid){

        videoGrid.innerHTML = "";
    }


    currentRoom = null;

    roomUnreadCount = 0;

    updateRoomUnreadBadge();


    roomScreen.style.display =
        "none";


    lobbyScreen.style.display =
        "flex";


    closeMobileChat();

    updateChatButtons();


    renderRooms();

    renderOnlineUsers();


    alert(
        "Ce salon a été supprimé."
    );
}
