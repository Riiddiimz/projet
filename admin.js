/* =========================================================
   ADMIN
========================================================= */


/* =========================================================
   OUVRIR ADMIN
========================================================= */

function openAdmin(){

    if(
        !currentUser ||
        !currentUser.isAdmin
    ){

        return;
    }


    currentAdminTab =
        "users";


    renderAdmin();


    const modal =
        document.getElementById(
            "adminModal"
        );


    if(modal){

        modal.style.display =
            "flex";
    }
}


/* =========================================================
   FERMER ADMIN
========================================================= */

function closeAdmin(){

    const modal =
        document.getElementById(
            "adminModal"
        );


    if(modal){

        modal.style.display =
            "none";
    }
}


/* =========================================================
   CHANGER D'ONGLET
========================================================= */

function switchAdminTab(tab){

    currentAdminTab =
        tab;

    renderAdmin();
}


/* =========================================================
   RENDU ADMIN
========================================================= */

function renderAdmin(){

    const container =
        document.getElementById(
            "adminList"
        );


    if(!container) return;


    if(currentAdminTab === "users"){

        renderAdminUsers(
            container
        );

        return;
    }


    if(currentAdminTab === "rooms"){

        renderAdminRooms(
            container
        );

        return;
    }


    container.innerHTML = "";
}


/* =========================================================
   UTILISATEURS
========================================================= */

function renderAdminUsers(
    container
){

    container.innerHTML = "";


    if(
        !users ||
        users.length === 0
    ){

        container.innerHTML =
            `
            <div class="empty-state">
                Aucun utilisateur.
            </div>
            `;

        return;
    }


    users.forEach(
        user => {

            const row =
                document.createElement(
                    "div"
                );

            row.className =
                "admin-row";


            const info =
                document.createElement(
                    "div"
                );

            info.className =
                "admin-user-info";


            const avatar =
                document.createElement(
                    "div"
                );

            avatar.className =
                "admin-user-avatar";


            if(
                typeof avatarInnerHtml ===
                "function"
            ){

                avatar.innerHTML =
                    avatarInnerHtml(
                        user
                    );

            }else{

                avatar.textContent =
                    "👤";
            }


            const text =
                document.createElement(
                    "div"
                );


            const name =
                document.createElement(
                    "div"
                );

            name.className =
                "admin-user-name";

            name.textContent =
                user.username ||
                "Utilisateur";


            const status =
                document.createElement(
                    "div"
                );

            status.className =
                "admin-user-status";


            status.textContent =
                user.online
                    ? "En ligne"
                    : "Hors ligne";


            text.appendChild(
                name
            );

            text.appendChild(
                status
            );


            info.appendChild(
                avatar
            );

            info.appendChild(
                text
            );


            const actions =
                document.createElement(
                    "div"
                );

            actions.className =
                "admin-actions";


            /*
             * Ne pas afficher les actions
             * contre le compte administrateur
             * ou un autre administrateur.
             */

            if(
                currentUser &&
                user.id !== currentUser.id &&
                !user.isAdmin
            ){

                /* =========================
                   MUTE
                ========================= */

                const muteButton =
                    document.createElement(
                        "button"
                    );

                muteButton.className =
                    "admin-action-btn";

                muteButton.textContent =
                    "🔇";

                muteButton.title =
                    "Couper le micro";

                muteButton.onclick =
                    () => adminMute(
                        user.id
                    );


                /* =========================
                   CAMERA
                ========================= */

                const cameraButton =
                    document.createElement(
                        "button"
                    );

                cameraButton.className =
                    "admin-action-btn";

                cameraButton.textContent =
                    "📹";

                cameraButton.title =
                    "Couper la caméra";

                cameraButton.onclick =
                    () => adminCamera(
                        user.id
                    );


                /* =========================
                   EXPULSER
                ========================= */

                const kickButton =
                    document.createElement(
                        "button"
                    );

                kickButton.className =
                    "admin-action-btn danger";

                kickButton.textContent =
                    "⛔";

                kickButton.title =
                    "Expulser";

                kickButton.onclick =
                    () => adminKick(
                        user.id
                    );


                actions.appendChild(
                    muteButton
                );

                actions.appendChild(
                    cameraButton
                );

                actions.appendChild(
                    kickButton
                );
            }


            row.appendChild(
                info
            );

            row.appendChild(
                actions
            );


            container.appendChild(
                row
            );
        }
    );
}


/* =========================================================
   SALONS
========================================================= */

function renderAdminRooms(
    container
){

    container.innerHTML = "";


    if(
        !rooms ||
        rooms.length === 0
    ){

        container.innerHTML =
            `
            <div class="empty-state">
                Aucun salon.
            </div>
            `;

        return;
    }


    rooms.forEach(
        room => {

            const row =
                document.createElement(
                    "div"
                );

            row.className =
                "admin-row";


            const info =
                document.createElement(
                    "div"
                );

            info.className =
                "admin-user-info";


            const icon =
                document.createElement(
                    "div"
                );

            icon.className =
                "admin-user-avatar";

            icon.textContent =
                "🏠";


            const text =
                document.createElement(
                    "div"
                );


            const name =
                document.createElement(
                    "div"
                );

            name.className =
                "admin-user-name";

            name.textContent =
                room.name ||
                "Salon";


            const count =
                document.createElement(
                    "div"
                );

            count.className =
                "admin-user-status";


            const usersCount =
                room.usersCount ??
                room.userCount ??
                room.users?.length ??
                0;


            count.textContent =
                usersCount +
                " participant(s)";


            text.appendChild(
                name
            );

            text.appendChild(
                count
            );


            info.appendChild(
                icon
            );

            info.appendChild(
                text
            );


            const actions =
                document.createElement(
                    "div"
                );

            actions.className =
                "admin-actions";


            const deleteButton =
                document.createElement(
                    "button"
                );

            deleteButton.className =
                "admin-action-btn danger";

            deleteButton.textContent =
                "🗑️";

            deleteButton.title =
                "Supprimer le salon";


            deleteButton.onclick =
                () => adminDeleteRoom(
                    room.id
                );


            actions.appendChild(
                deleteButton
            );


            row.appendChild(
                info
            );

            row.appendChild(
                actions
            );


            container.appendChild(
                row
            );
        }
    );
}


/* =========================================================
   MUTE ADMIN
========================================================= */

function adminMute(userId){

    if(!userId) return;


    send({
        type:"admin-mute",
        userId
    });
}


/* =========================================================
   CAMERA ADMIN
========================================================= */

function adminCamera(userId){

    if(!userId) return;


    send({
        type:"admin-camera",
        userId
    });
}


/* =========================================================
   EXPULSER UN UTILISATEUR
========================================================= */

function adminKick(userId){

    if(!userId) return;


    const user =
        typeof findUserById ===
        "function"
            ? findUserById(
                userId
            )
            : null;


    const username =
        user &&
        user.username
            ? user.username
            : "cet utilisateur";


    const confirmed =
        confirm(
            `Voulez-vous vraiment expulser ${username} ?`
        );


    if(!confirmed) return;


    send({
        type:"admin-kick",
        userId
    });
}


/* =========================================================
   SUPPRIMER UN SALON
========================================================= */

function adminDeleteRoom(roomId){

    if(!roomId) return;


    const room =
        rooms.find(
            item =>
                item.id ===
                roomId
        );


    const roomName =
        room &&
        room.name
            ? room.name
            : "ce salon";


    const confirmed =
        confirm(
            `Voulez-vous vraiment supprimer ${roomName} ?`
        );


    if(!confirmed) return;


    send({
        type:"admin-delete-room",
        roomId
    });
}


/* =========================================================
   FERMETURE DES MODALES
========================================================= */

function closeModalOutside(
    event,
    modalId
){

    if(!event) return;


    /*
     * Si aucun modalId n'est fourni,
     * on utilise l'ancien comportement.
     */

    if(!modalId){

        if(
            event.target ===
            document.getElementById(
                "profileModal"
            )
        ){

            closeProfile();

            return;
        }


        if(
            event.target ===
            document.getElementById(
                "userProfileModal"
            )
        ){

            closeUserProfile();

            return;
        }


        if(
            event.target ===
            document.getElementById(
                "adminModal"
            )
        ){

            closeAdmin();

            return;
        }


        return;
    }


    /*
     * Nouveau fonctionnement :
     * l'index.html transmet directement
     * l'identifiant de la modale.
     */

    if(
        event.target.id !==
        modalId
    ){

        return;
    }


    if(
        modalId ===
        "profileModal"
    ){

        closeProfile();

        return;
    }


    if(
        modalId ===
        "userProfileModal"
    ){

        closeUserProfile();

        return;
    }


    if(
        modalId ===
        "adminModal"
    ){

        closeAdmin();

        return;
    }
}
