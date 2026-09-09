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
        const button = document.getElementById("usersSidebarToggle");
        if(!lobby) return;

        lobby.classList.toggle("users-hidden", hidden);

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

        /* On remplace complètement le onclick inline pour éviter un double toggle. */
        button.onclick = function(event){
            event.preventDefault();
            event.stopPropagation();
            window.toggleUsersSidebar();
        };

        if(window.innerWidth <= 700){
            setUsersSidebarState(true);
        }else{
            lobby.classList.remove("users-hidden");
            button.textContent = "‹ Utilisateurs";
        }
    }

    if(document.readyState === "loading"){
        document.addEventListener("DOMContentLoaded", setupMobileUsersButton);
    }else{
        setupMobileUsersButton();
    }

    window.addEventListener("resize", setupMobileUsersButton);

    const style = document.createElement("style");
    style.id = "colincall-mobile-fixes-v3";
    style.textContent = "\n        .video-card .video-overlay{position:absolute;inset:0;z-index:2;display:flex;align-items:flex-end;padding:10px;pointer-events:none;}\n        .video-card .video-media-state{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:max-content;max-width:90%;padding:10px 14px;border:1px solid var(--border);border-radius:10px;background:rgba(8,10,16,.82);color:var(--text);font-size:13px;font-weight:700;text-align:center;}\n        .video-card .video-media-state:empty{display:none;}\n        @media (max-width:700px){\n            #usersSidebarToggle{display:flex !important;position:fixed !important;left:14px !important;bottom:14px !important;z-index:99999 !important;pointer-events:auto !important;touch-action:manipulation !important;}\n            .lobby-screen > .users-sidebar{position:fixed !important;top:68px !important;left:0 !important;bottom:0 !important;width:280px !important;max-width:82vw !important;height:auto !important;z-index:99998 !important;flex:0 0 280px !important;padding:18px 14px !important;background:var(--panel) !important;border-right:1px solid var(--border) !important;box-shadow:18px 0 45px rgba(0,0,0,.45);opacity:1 !important;transform:translateX(0) !important;overflow-y:auto !important;}\n            .lobby-screen.users-hidden > .users-sidebar{opacity:0 !important;transform:translateX(-105%) !important;pointer-events:none !important;}\n            #roomChatMobileButton{display:flex !important;position:fixed !important;right:14px !important;left:auto !important;bottom:14px !important;z-index:1000 !important;}\n            .room-screen:has(#roomChat.mobile-open) #roomChatMobileButton{display:none !important;}\n            .room-screen > #roomChat{position:fixed !important;top:68px !important;right:0 !important;bottom:0 !important;left:0 !important;width:auto !important;height:auto !important;max-height:none !important;z-index:1001 !important;display:flex !important;opacity:0;visibility:hidden;pointer-events:none;transform:translateY(12px);border-left:0 !important;}\n            .room-screen > #roomChat.mobile-open{opacity:1 !important;visibility:visible !important;pointer-events:auto !important;transform:translateY(0);}\n            .room-screen:has(#roomChat.mobile-open) .room-bottom-controls{display:none !important;}\n        }\n    ";
    document.head.appendChild(style);
})();
