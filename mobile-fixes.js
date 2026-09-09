/* Corrections mobile Col'inCall */
(function(){
    const originalPrepareLocalMedia = window.prepareLocalMedia;

    if(typeof originalPrepareLocalMedia === "function"){
        window.prepareLocalMedia = async function(){
            const ready = await originalPrepareLocalMedia();
            if(!ready) return false;

            if(typeof window.toggleMicro === "function"){
                window.toggleMicro();
            }

            if(typeof window.toggleCamera === "function"){
                window.toggleCamera();
            }

            return true;
        };
    }

    window.toggleUsersSidebar = function(){
        const lobby = document.getElementById("lobbyScreen");
        if(!lobby) return;

        const hidden = lobby.classList.toggle("users-hidden");
        const button = document.getElementById("usersSidebarToggle");

        if(button){
            button.textContent = hidden ? "👥 Utilisateurs" : "× Fermer";
            button.setAttribute(
                "aria-label",
                hidden
                    ? "Afficher les utilisateurs"
                    : "Masquer les utilisateurs"
            );
        }
    };

    /* =========================================================
       CORRECTIONS VISUELLES MOBILE
    ========================================================= */
    const style = document.createElement("style");
    style.id = "colincall-mobile-fixes";
    style.textContent = `
        /* Message central quand la caméra est coupée */
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

        .video-card .video-media-state:empty{
            display:none;
        }

        @media (max-width:700px){
            /* Panneau utilisateurs : vraie fenêtre latérale mobile */
            .lobby-screen > .users-sidebar{
                position:fixed !important;
                top:68px !important;
                left:0 !important;
                bottom:0 !important;
                width:280px !important;
                max-width:82vw !important;
                height:auto !important;
                z-index:100 !important;
                flex:0 0 280px !important;
                padding:18px 14px !important;
                background:var(--panel) !important;
                border-right:1px solid var(--border) !important;
                box-shadow:18px 0 45px rgba(0,0,0,.45);
                transform:translateX(0) !important;
                opacity:1 !important;
                overflow-y:auto !important;
            }

            .lobby-screen.users-hidden > .users-sidebar{
                width:280px !important;
                flex-basis:280px !important;
                opacity:0 !important;
                transform:translateX(-105%) !important;
                overflow-y:auto !important;
            }

            #usersSidebarToggle{
                left:14px !important;
                bottom:14px !important;
                z-index:110 !important;
            }

            /* Le chat du salon recouvre entièrement le salon */
            .room-screen > #roomChat{
                position:fixed !important;
                top:68px !important;
                right:0 !important;
                bottom:0 !important;
                left:0 !important;
                width:auto !important;
                height:auto !important;
                max-height:none !important;
                z-index:105 !important;
                display:flex !important;
                opacity:0;
                visibility:hidden;
                pointer-events:none;
                transform:translateY(12px);
                transition:opacity .22s ease,transform .22s ease,visibility 0s linear .22s;
                border-left:0 !important;
            }

            .room-screen > #roomChat.mobile-open{
                opacity:1;
                visibility:visible;
                pointer-events:auto;
                transform:translateY(0);
                transition:opacity .22s ease,transform .22s ease,visibility 0s linear 0s;
            }

            /* Les boutons micro/caméra/quitter ne doivent jamais rester au-dessus du chat */
            .room-screen:has(#roomChat.mobile-open) .room-bottom-controls{
                display:none !important;
            }

            .room-screen:has(#roomChat.mobile-open) #roomChatMobileButton{
                display:none !important;
            }
        }
    `;

    document.head.appendChild(style);
})();
