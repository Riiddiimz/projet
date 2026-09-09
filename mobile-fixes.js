/* Corrections mobile Col'inCall */
(function(){
    const originalPrepareLocalMedia = window.prepareLocalMedia;

    /*
     * On conserve toute la logique WebRTC de room.js.
     * Une fois les permissions obtenues, on utilise les fonctions
     * officielles toggleMicro/toggleCamera pour mettre les deux
     * médias à OFF au démarrage du salon.
     */
    if(typeof originalPrepareLocalMedia === "function"){
        window.prepareLocalMedia = async function(){
            const ready = await originalPrepareLocalMedia();
            if(!ready) return false;

            /*
             * room.js initialise actuellement micro + caméra à ON.
             * On les repasse immédiatement à OFF avec la vraie logique
             * de room.js, ce qui conserve les bonnes variables d'état.
             */
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
})();
