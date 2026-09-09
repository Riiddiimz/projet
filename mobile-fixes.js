/* Corrections mobile Col'inCall */
(function(){
    const originalPrepareLocalMedia = window.prepareLocalMedia;

    if(typeof originalPrepareLocalMedia === "function"){
        window.prepareLocalMedia = async function(){
            const ready = await originalPrepareLocalMedia();
            if(!ready) return false;
            if(typeof window.toggleMicro === "function") window.toggleMicro();
            if(typeof window.toggleCamera === "function") window.toggleCamera();
            return true;
        };
    }

    function setUsersSidebarState(hidden){
        const lobby = document.getElementById("lobbyScreen");
        const sidebar = lobby?.querySelector(".users-sidebar");
        const button = document.getElementById("usersSidebarToggle");
        if(!lobby || !sidebar) return;

        lobby.classList.toggle("users-hidden", hidden);

        /* On applique aussi l'état directement sur l'élément.
           Cela évite qu'une autre règle CSS empêche l'ouverture. */
        if(window.innerWidth <= 700){
            sidebar.style.transform = hidden ? "translateX(-105%)" : "translateX(0)";
            sidebar.style.opacity = hidden ? "0" : "1";
            sidebar.style.pointerEvents = hidden ? "none" : "auto";
        }else{
            sidebar.style.transform = "";
            sidebar.style.opacity = "";
            sidebar.style.pointerEvents = "";
        }

        if(button){
            button.textContent = hidden ? "👥 Utilisateurs" : "× Fermer";
            button.setAttribute(
                "aria-label",
                hidden ? "Afficher les utilisateurs" : "Fermer les utilisateurs"
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

        /* Suppression du onclick inline puis gestion unique du clic. */
        button.onclick = null;
        button.onpointerup = function(event){
            event.preventDefault();
            event.stopPropagation();
            window.toggleUsersSidebar();
        };

        if(window.innerWidth <= 700){
            setUsersSidebarState(true);
        }else{
            setUsersSidebarState(false);
        }
    }

    function setup(){
        setupMobileUsersButton();

        /* Sécurité supplémentaire : si le navigateur ne déclenche pas
           correctement pointerup sur le bouton, on intercepte le clic. */
        document.addEventListener("click", function(event){
            const button = event.target.closest?.("#usersSidebarToggle");
            if(!button) return;
            event.preventDefault();
            event.stopPropagation();
            window.toggleUsersSidebar();
        }, true);
    }

    if(document.readyState === "loading"){
        document.addEventListener("DOMContentLoaded", setup, {once:true});
    }else{
        setup();
    }

    window.addEventListener("resize", setupMobileUsersButton);

    const style = document.createElement("style");
    style.id = "colincall-mobile-fixes-v4";
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
