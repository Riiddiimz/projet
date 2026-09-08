/* Corrections mobile Col'inCall */
(function(){
    const originalPrepareLocalMedia = window.prepareLocalMedia;

    /*
     * On conserve la vraie initialisation WebRTC de room.js.
     * On coupe ensuite les pistes sans remplacer la fonction originale,
     * afin de ne pas casser les références utilisées par room.js.
     */
    if(typeof originalPrepareLocalMedia === "function"){
        window.prepareLocalMedia = async function(){
            const ready = await originalPrepareLocalMedia();
            if(!ready) return false;

            if(window.localStream){
                window.localStream.getAudioTracks().forEach(track => {
                    track.enabled = false;
                });
                window.localStream.getVideoTracks().forEach(track => {
                    track.enabled = false;
                });
            }

            window.microphoneEnabled = false;
            window.cameraEnabled = false;

            if(typeof window.updateLocalCameraDisplay === "function"){
                window.updateLocalCameraDisplay();
            }
            if(typeof window.updateControlButton === "function"){
                window.updateControlButton("microBtn", false, "🎙️", "🔇");
                window.updateControlButton("cameraBtn", false, "📹", "🚫");
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
            button.setAttribute("aria-label", hidden ? "Afficher les utilisateurs" : "Masquer les utilisateurs");
        }
    };
})();
