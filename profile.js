/* =========================================================
   PROFILE
========================================================= */


/* =========================================================
   OUVRIR MON PROFIL
========================================================= */

function openProfile(){

    if(!currentUser) return;

    pendingAvatarUrl =
        currentUser.avatarUrl;


    const username =
        document.getElementById(
            "profileUsername"
        );

    if(username){

        username.value =
            currentUser.username || "";
    }


    const description =
        document.getElementById(
            "profileDescription"
        );

    if(description){

        description.value =
            currentUser.description || "";
    }


    const avatarPreview =
        document.getElementById(
            "profileAvatarPreview"
        );

    if(avatarPreview){

        avatarPreview.innerHTML =
            avatarInnerHtml(
                currentUser,
                true
            );
    }


    profileModal.classList.add(
        "visible"
    );
}


/* =========================================================
   FERMER MON PROFIL
========================================================= */

function closeProfile(){

    profileModal.classList.remove(
        "visible"
    );

    pendingAvatarUrl =
        undefined;
}


/* =========================================================
   OUVRIR LE SELECTEUR AVATAR
========================================================= */

function triggerAvatarPicker(){

    const input =
        document.getElementById(
            "profileAvatarInput"
        );

    if(input){

        input.click();
    }
}


/* =========================================================
   CHANGER L'AVATAR
========================================================= */

function handleAvatarFile(event){

    const file =
        event.target.files &&
        event.target.files[0];


    if(!file) return;


    /*
     * Vérification du type
     */

    if(
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


    /*
     * Limite à 5 Mo
     */

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


    const reader =
        new FileReader();


    reader.onload =
        () => {

            pendingAvatarUrl =
                reader.result;


            const preview =
                document.getElementById(
                    "profileAvatarPreview"
                );


            if(preview){

                preview.innerHTML =
                    `
                    <img
                        src="${pendingAvatarUrl}"
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
            "profileDescription"
        );


    const newDescription =
        description
            ? description.value.trim()
            : "";


    send({
        type:"update-profile",
        description:
            newDescription,
        avatarUrl:
            pendingAvatarUrl
    });
}


/* =========================================================
   OUVRIR LE PROFIL D'UN AUTRE UTILISATEUR
========================================================= */

function openUserProfile(userId){

    if(!userId) return;


    const user =
        findUserById(
            userId
        );


    if(!user) return;


    viewingUserId =
        userId;


    const username =
        document.getElementById(
            "otherProfileUsername"
        );


    if(username){

        username.textContent =
            user.username ||
            "Utilisateur";
    }


    const description =
        document.getElementById(
            "otherProfileDescription"
        );


    if(description){

        description.textContent =
            user.description ||
            "Aucune description.";
    }


    const avatar =
        document.getElementById(
            "otherProfileAvatar"
        );


    if(avatar){

        avatar.innerHTML =
            avatarInnerHtml(
                user,
                true
            );
    }


    otherUserProfileModal.classList.add(
        "visible"
    );
}


/* =========================================================
   FERMER LE PROFIL D'UN AUTRE UTILISATEUR
========================================================= */

function closeUserProfile(){

    otherUserProfileModal.classList.remove(
        "visible"
    );

    viewingUserId =
        null;
}
