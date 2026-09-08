/* Corrections mobile Col'inCall */
(function(){
    const originalPrepareLocalMedia = window.prepareLocalMedia;

    window.prepareLocalMedia = async function(){
        if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
            alert("Votre navigateur ne permet pas l'accès à la caméra et au microphone.");
            return false;
        }

        try{
            if(window.localStream){
                window.localStream.getTracks().forEach(track => track.stop());
                window.localStream = null;
            }

            const stream = await navigator.mediaDevices.getUserMedia({audio:true, video:true});
            stream.getAudioTracks().forEach(track => track.enabled = false);
            stream.getVideoTracks().forEach(track => track.enabled = false);

            window.localStream = stream;
            window.microphoneEnabled = false;
            window.cameraEnabled = false;
            return true;
        }catch(error){
            console.error("Accès média refusé :", error);
            return false;
        }
    };

    const originalToggleUsersSidebar = window.toggleUsersSidebar;
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
