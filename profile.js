/* =========================================================
   PROFILE
========================================================= */

function openProfile(){

    if(!currentUser) return;


    pendingAvatarUrl =
        currentUser.avatarUrl;


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


    const username =
        document.getElementById(
            "profileUsername"
        );

    if(username){

        username.textContent =
            currentUser.username ||
            "Utilisateur";
    }


    const id =
        document.getElementById(
            "profileId"
        );

    if(id){

        id.textContent =
            currentUser.id
                ? "ID : " +
                  currentUser.id
                : "";
    }


    const description =
        document.getElementById(
            "profileDescriptionInput"
        );

    if(description){

        description.value =
            currentUser.description ||
            "";
    }


    const modal =
        document.getElementById(
            "profileModal"
        );

    if(modal){

        modal.style.display =
            "flex";
    }
}


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
}


/* =========================================================
   AVATAR
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


function handleAvatarFile(event){

    const file =
        event.target.files &&
        event.target.files[0];

    if(!file) return;


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


            const avatar =
                document.getElementById(
                    "profileAvatar"
                );


            if(avatar){

                avatar.innerHTML =
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
   SAUVEGARDE
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
   PROFIL AUTRE UTILISATEUR
========================================================= */

function openUserProfile(userId){

    if(!userId) return;


    if(
        currentUser &&
        userId === currentUser.id
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


    const username =
        document.getElementById(
            "viewProfileUsername"
        );

    if(username){

        username.textContent =
            user.username ||
            "Utilisateur";
    }


    const description =
        document.getElementById(
            "viewProfileDescription"
        );

    if(description){

        description.textContent =
            user.description ||
            "Aucune description.";
    }


    const modal =
        document.getElementById(
            "userProfileModal"
        );

    if(modal){

        modal.style.display =
            "flex";
    }
}


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
