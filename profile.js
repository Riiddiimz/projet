/* =========================================================
   PROFILE
========================================================= */


/* =========================================================
   MON PROFIL
========================================================= */

function openProfile(){

    if(!currentUser) return;


    pendingAvatarUrl =
        currentUser.avatarUrl;


    /* =====================================================
       AVATAR
    ===================================================== */

    const avatar =
        document.getElementById(
            "profileAvatar"
        );


    if(avatar){

        avatar.innerHTML =
            avatarInnerHtml(
                currentUser
            );
    }


    /* =====================================================
       USERNAME
    ===================================================== */

    const username =
        document.getElementById(
            "profileUsername"
        );


    if(username){

        username.textContent =
            currentUser.username ||
            "Utilisateur";
    }


    /* =====================================================
       ID
    ===================================================== */

    const id =
        document.getElementById(
            "profileId"
        );


    if(id){

        id.textContent =
            currentUser.id
                ? "ID : " + currentUser.id
                : "";
    }


    /* =====================================================
       DESCRIPTION
    ===================================================== */

    const description =
        document.getElementById(
            "profileDescriptionInput"
        );


    if(description){

        description.value =
            currentUser.description ||
            "";
    }


    /* =====================================================
       MODAL
    ===================================================== */

    const modal =
        document.getElementById(
            "profileModal"
        );


    if(modal){

        modal.style.display =
            "flex";
    }
}


/* =========================================================
   FERMER MON PROFIL
========================================================= */

function closeProfile(){

    const modal =
        document.getElementById(
            "profileModal"
        );


    if(modal){

        modal.style.display =
            "none";
    }


    pendingAvatarUrl =
        undefined;


    const input =
        document.getElementById(
            "avatarFileInput"
        );


    if(input){

        input.value = "";
    }
}


/* =========================================================
   CHOISIR UN AVATAR
========================================================= */

function triggerAvatarPicker(){

    const input =
        document.getElementById(
            "avatarFileInput"
        );


    if(input){

        input.click();
    }
}


/* =========================================================
   FICHIER AVATAR
========================================================= */

function handleAvatarFile(event){

    const file =
        event.target.files &&
        event.target.files[0];


    if(!file) return;


    /* =====================================================
       VERIFICATION TYPE
    ===================================================== */

    if(
        !file.type ||
        !file.type.startsWith(
            "image/"
        )
    ){

        alert(
            "Veuillez sélectionner une image."
        );


        event.target.value = "";

        return;
    }


    /* =====================================================
       VERIFICATION TAILLE
    ===================================================== */

    if(
        file.size >
        5 * 1024 * 1024
    ){

        alert(
            "L'image ne doit pas dépasser 5 Mo."
        );


        event.target.value = "";

        return;
    }


    /* =====================================================
       LECTURE IMAGE
    ===================================================== */

    const reader =
        new FileReader();


    reader.onload =
        () => {

            pendingAvatarUrl =
                reader.result;


            const avatar =
                document.getElementById(
                    "profileAvatar"
                );


            if(avatar){

                avatar.innerHTML = `
                    <img
                        src="${escapeHtml(
                            pendingAvatarUrl
                        )}"
                        alt="Avatar"
                    >
                `;
            }
        };


    reader.onerror =
        () => {

            alert(
                "Impossible de lire cette image."
            );

            event.target.value = "";
        };


    reader.readAsDataURL(
        file
    );
}


/* =========================================================
   SAUVEGARDER LE PROFIL
========================================================= */

function saveProfile(){

    if(!currentUser) return;


    const description =
        document.getElementById(
            "profileDescriptionInput"
        );


    const payload = {

        type:
            "update-profile",

        description:
            description
                ? description.value.trim()
                : ""

    };


    /*
     * On envoie l'avatar uniquement
     * s'il a été modifié.
     */

    if(
        pendingAvatarUrl !==
        undefined
    ){

        payload.avatarUrl =
            pendingAvatarUrl;
    }


    send(
        payload
    );


    closeProfile();
}


/* =========================================================
   PROFIL D'UN AUTRE UTILISATEUR
========================================================= */

function openUserProfile(userId){

    if(!userId) return;


    /*
     * Si l'utilisateur ouvre son propre profil,
     * on ouvre le profil personnel.
     */

    if(
        currentUser &&
        userId ===
            currentUser.id
    ){

        openProfile();

        return;
    }


    const user =
        findUserById(
            userId
        );


    if(!user) return;


    viewingUserId =
        userId;


    /* =====================================================
       AVATAR
    ===================================================== */

    const avatar =
        document.getElementById(
            "viewProfileAvatar"
        );


    if(avatar){

        avatar.innerHTML =
            avatarInnerHtml(
                user
            );
    }


    /* =====================================================
       USERNAME
    ===================================================== */

    const username =
        document.getElementById(
            "viewProfileUsername"
        );


    if(username){

        username.textContent =
            user.username ||
            "Utilisateur";
    }


    /* =====================================================
       DESCRIPTION
    ===================================================== */

    const description =
        document.getElementById(
            "viewProfileDescription"
        );


    if(description){

        description.textContent =
            user.description ||
            "Aucune description.";
    }


    /* =====================================================
       ACTIONS ADMIN
    ===================================================== */

    const adminActions =
        document.getElementById(
            "viewProfileAdminActions"
        );


    if(adminActions){

        adminActions.style.display =
            currentUser &&
            currentUser.isAdmin
                ? "flex"
                : "none";
    }


    /* =====================================================
       MODAL
    ===================================================== */

    const modal =
        document.getElementById(
            "userProfileModal"
        );


    if(modal){

        modal.style.display =
            "flex";
    }
}


/* =========================================================
   FERMER PROFIL AUTRE UTILISATEUR
========================================================= */

function closeUserProfile(){

    const modal =
        document.getElementById(
            "userProfileModal"
        );


    if(modal){

        modal.style.display =
            "none";
    }


    viewingUserId =
        null;
}
