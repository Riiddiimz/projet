/* Corrections mobile Col'inCall */
(function(){
    function setUsersSidebarState(hidden){
        const lobby = document.getElementById("lobbyScreen");
        const sidebar = lobby?.querySelector(".users-sidebar");
        const button = document.getElementById("usersSidebarToggle");
        if(!lobby || !sidebar) return;

        const mobile = window.innerWidth <= 700;
        lobby.classList.toggle("users-hidden", mobile && hidden);

        if(mobile){
            sidebar.style.transform = hidden ? "translateX(-105%)" : "translateX(0)";
            sidebar.style.opacity = hidden ? "0" : "1";
            sidebar.style.pointerEvents = hidden ? "none" : "auto";
        }else{
            sidebar.style.transform = "";
            sidebar.style.opacity = "";
            sidebar.style.pointerEvents = "";
        }

        if(button){
            button.textContent = hidden && mobile ? "👥 Utilisateurs" : "× Fermer";
            button.setAttribute(
                "aria-label",
                hidden && mobile ? "Afficher les utilisateurs" : "Fermer les utilisateurs"
            );
        }
    }

    window.toggleUsersSidebar = function(){
        const lobby = document.getElementById("lobbyScreen");
        if(!lobby) return;
        setUsersSidebarState(!lobby.classList.contains("users-hidden"));
    };

    function setupMobileUsersButton(){
        const button = document.getElementById("usersSidebarToggle");
        const lobby = document.getElementById("lobbyScreen");
        if(!button || !lobby) return;

        if(window.innerWidth <= 700){
            button.style.display = "flex";
            setUsersSidebarState(lobby.classList.contains("users-hidden"));
        }else{
            setUsersSidebarState(false);
        }
    }

    function setup(){
        setupMobileUsersButton();
    }

    if(document.readyState === "loading"){
        document.addEventListener("DOMContentLoaded", setup, {once:true});
    }else{
        setup();
    }

    window.addEventListener("resize", setupMobileUsersButton);

    /*
     * LOGIN MOBILE ROBUSTE
     *
     * admin.js possède déjà le formulaire utilisateur. Sur certaines
     * connexions mobiles, le WebSocket peut rester en CONNECTING plus
     * longtemps que prévu. On intercepte uniquement le bouton utilisateur
     * et on réessaie l'envoi jusqu'à ce que send() confirme OPEN.
     * Aucun accès à window.socket n'est utilisé : socket est un binding
     * lexical dans app.js.
     */
    function robustUserLogin(event){
        const button = event.target.closest?.("#userLoginButton");
        if(!button) return;

        const input = document.getElementById("userUsernameInput");
        const errorElement = document.getElementById("userLoginError");
        const username = input?.value?.trim() || "";

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        if(errorElement) errorElement.textContent = "";

        if(!username){
            if(errorElement) errorElement.textContent = "Entrez un nom d'utilisateur.";
            return;
        }

        if(typeof window.connectSocket !== "function" || typeof window.send !== "function"){
            if(errorElement) errorElement.textContent = "Connexion impossible.";
            return;
        }

        window.connectSocket();

        let finished = false;
        const startedAt = Date.now();
        const timeout = 15000;

        const timer = setInterval(() => {
            if(finished){
                clearInterval(timer);
                return;
            }

            if(Date.now() - startedAt >= timeout){
                finished = true;
                clearInterval(timer);
                if(errorElement) errorElement.textContent = "Connexion impossible.";
                return;
            }

            try{
                const sent = window.send({
                    type: "login",
                    username,
                    password: "",
                    isAdmin: false
                });

                if(sent){
                    finished = true;
                    clearInterval(timer);
                }
            }catch(error){
                /* Le WebSocket peut encore être en transition. On réessaie. */
            }
        }, 100);
    }

    document.addEventListener("click", robustUserLogin, true);

    const style = document.createElement("style");
    style.id = "colincall-mobile-fixes-v6";
    style.textContent = `
        .video-card .video-overlay{
            position:absolute;
            inset:0;
            z-index:2;
            display:flex;
            align-items:flex-end;
            padding:10px;
            pointer-events:none;
        }

        .video-card .video-media-state{
            position:absolute;
            left:50%;
            top:50%;
            transform:translate(-50%,-50%);
            width:max-content;
            max-width:90%;
            padding:10px 14px;
            border:1px solid var(--border);
            border-radius:10px;
            background:rgba(8,10,16,.82);
            color:var(--text);
            font-size:13px;
            font-weight:700;
            text-align:center;
        }

        .video-card .video-media-state:empty{display:none;}

        @media (max-width:700px){
            #usersSidebarToggle{
                display:flex !important;
                position:fixed !important;
                left:14px !important;
                bottom:14px !important;
                z-index:999999 !important;
                pointer-events:auto !important;
                touch-action:manipulation !important;
            }

            .lobby-screen > .users-sidebar{
                position:fixed !important;
                top:68px !important;
                left:0 !important;
                bottom:0 !important;
                width:280px !important;
                max-width:82vw !important;
                height:auto !important;
                z-index:999998 !important;
                flex:0 0 280px !important;
                padding:18px 14px !important;
                background:var(--panel) !important;
                border-right:1px solid var(--border) !important;
                box-shadow:18px 0 45px rgba(0,0,0,.45);
                overflow-y:auto !important;
                transition:transform .2s ease, opacity .2s ease !important;
            }

            .lobby-screen.users-hidden > .users-sidebar{
                opacity:0 !important;
                transform:translateX(-105%) !important;
                pointer-events:none !important;
            }

            #roomChatMobileButton{
                display:flex !important;
                position:fixed !important;
                right:14px !important;
                left:auto !important;
                bottom:14px !important;
                z-index:1000 !important;
            }

            .room-screen:has(#roomChat.mobile-open) #roomChatMobileButton{
                display:none !important;
            }

            .room-screen > #roomChat{
                position:fixed !important;
                top:68px !important;
                right:0 !important;
                bottom:0 !important;
                left:0 !important;
                width:auto !important;
                height:auto !important;
                max-height:none !important;
                z-index:1001 !important;
                display:flex !important;
                opacity:0;
                visibility:hidden;
                pointer-events:none;
                transform:translateY(12px);
                border-left:0 !important;
            }

            .room-screen > #roomChat.mobile-open{
                opacity:1 !important;
                visibility:visible !important;
                pointer-events:auto !important;
                transform:translateY(0);
            }

            .room-screen:has(#roomChat.mobile-open) .room-bottom-controls{
                display:none !important;
            }
        }
    `;
    document.head.appendChild(style);
})();