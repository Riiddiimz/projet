/* =========================================================
   AUTHENTIFICATION UTILISATEUR / ADMINISTRATEUR

   Ce fichier ajoute le choix du mode de connexion sans modifier
   le fonctionnement existant du WebSocket ni du serveur.
========================================================= */

(function(){

    const authScreen =
        document.getElementById("authScreen");

    if(!authScreen){
        return;
    }

    const card =
        authScreen.querySelector(".auth-card");

    if(!card){
        return;
    }

    /* =====================================================
       CONSTRUIRE L'INTERFACE
    ====================================================== */

    const subtitle =
        card.querySelector(".auth-subtitle");

    if(subtitle){
        subtitle.textContent =
            "Communication simple et instantanée";
    }

    const existingForm =
        card.querySelector(".auth-form");

    if(!existingForm){
        return;
    }

    existingForm.innerHTML = `

        <div
            id="authChoice"
            class="auth-form"
        >

            <button
                type="button"
                class="primary-btn"
                id="userModeButton"
            >
                👤 Utilisateur
            </button>

            <button
                type="button"
                class="secondary-btn"
                id="adminModeButton"
            >
                🛡️ Administrateur
            </button>

        </div>


        <div
            id="userLoginForm"
            class="auth-form"
            style="display:none;"
        >

            <input
                id="userUsernameInput"
                type="text"
                placeholder="Nom d'utilisateur"
                autocomplete="username"
            >

            <button
                type="button"
                class="primary-btn"
                id="userLoginButton"
            >
                Se connecter
            </button>

            <button
                type="button"
                class="secondary-btn"
                id="userBackButton"
            >
                ← Retour
            </button>

            <div
                id="userLoginError"
                class="login-error"
            ></div>

        </div>


        <div
            id="adminLoginForm"
            class="auth-form"
            style="display:none;"
        >

            <input
                id="adminUsernameInput"
                type="text"
                placeholder="Nom d'administrateur"
                autocomplete="username"
            >

            <input
                id="adminPasswordInput"
                type="password"
                placeholder="Code administrateur"
                autocomplete="current-password"
            >

            <button
                type="button"
                class="primary-btn"
                id="adminLoginButton"
            >
                Se connecter
            </button>

            <button
                type="button"
                class="secondary-btn"
                id="adminBackButton"
            >
                ← Retour
            </button>

            <div
                id="adminLoginError"
                class="login-error"
            ></div>

        </div>
    `;

    const choice =
        document.getElementById("authChoice");

    const userForm =
        document.getElementById("userLoginForm");

    const adminForm =
        document.getElementById("adminLoginForm");

    const userInput =
        document.getElementById("userUsernameInput");

    const adminInput =
        document.getElementById("adminUsernameInput");

    const adminPassword =
        document.getElementById("adminPasswordInput");

    const userError =
        document.getElementById("userLoginError");

    const adminError =
        document.getElementById("adminLoginError");

    let mode = null;


    /* =====================================================
       AFFICHAGE DES MODES
    ====================================================== */

    function selectLoginMode(selectedMode){

        mode = selectedMode;

        if(choice){
            choice.style.display = "none";
        }

        if(userForm){
            userForm.style.display =
                selectedMode === "user"
                    ? "flex"
                    : "none";
        }

        if(adminForm){
            adminForm.style.display =
                selectedMode === "admin"
                    ? "flex"
                    : "none";
        }

        if(userError){
            userError.textContent = "";
        }

        if(adminError){
            adminError.textContent = "";
        }

        setTimeout(() => {

            if(selectedMode === "user" && userInput){
                userInput.focus();
            }

            if(selectedMode === "admin" && adminInput){
                adminInput.focus();
            }

        }, 0);
    }


    function backToChoice(){

        mode = null;

        if(choice){
            choice.style.display = "flex";
        }

        if(userForm){
            userForm.style.display = "none";
        }

        if(adminForm){
            adminForm.style.display = "none";
        }

        if(userInput){
            userInput.value = "";
        }

        if(adminInput){
            adminInput.value = "";
        }

        if(adminPassword){
            adminPassword.value = "";
        }

        if(userError){
            userError.textContent = "";
        }

        if(adminError){
            adminError.textContent = "";
        }
    }


    /* =====================================================
       ENVOI DU LOGIN
    ====================================================== */

    function sendLoginWhenReady(
        username,
        password,
        isAdmin
    ){

        const errorElement =
            isAdmin
                ? adminError
                : userError;

        const doLogin = () => {

            if(typeof send === "function"){

                send({
                    type: "login",
                    username,
                    password,
                    isAdmin
                });

                return;
            }

            if(errorElement){
                errorElement.textContent =
                    "Erreur de connexion.";
            }
        };

        if(
            typeof socket !== "undefined" &&
            socket &&
            socket.readyState === WebSocket.OPEN
        ){

            doLogin();
            return;
        }

        if(
            typeof socket !== "undefined" &&
            socket &&
            socket.readyState === WebSocket.CONNECTING
        ){

            socket.addEventListener(
                "open",
                doLogin,
                {once:true}
            );

            return;
        }

        if(typeof connectSocket === "function"){

            connectSocket();

            if(
                typeof socket !== "undefined" &&
                socket
            ){

                socket.addEventListener(
                    "open",
                    doLogin,
                    {once:true}
                );

            }else if(errorElement){

                errorElement.textContent =
                    "Impossible de contacter le serveur.";
            }

        }else if(errorElement){

            errorElement.textContent =
                "Impossible de contacter le serveur.";
        }
    }


    function loginAsUser(){

        const username =
            userInput?.value.trim();

        if(userError){
            userError.textContent = "";
        }

        if(!username){

            if(userError){
                userError.textContent =
                    "Entrez un nom d'utilisateur.";
            }

            return;
        }

        sendLoginWhenReady(
            username,
            "",
            false
        );
    }


    function loginAsAdmin(){

        const username =
            adminInput?.value.trim();

        const password =
            adminPassword?.value.trim();

        if(adminError){
            adminError.textContent = "";
        }

        if(!username){

            if(adminError){
                adminError.textContent =
                    "Entrez le nom d'administrateur.";
            }

            return;
        }

        if(!password){

            if(adminError){
                adminError.textContent =
                    "Entrez le code administrateur.";
            }

            return;
        }

        sendLoginWhenReady(
            username,
            password,
            true
        );
    }


    /* =====================================================
       BOUTONS
    ====================================================== */

    document
        .getElementById("userModeButton")
        ?.addEventListener(
            "click",
            () => selectLoginMode("user")
        );

    document
        .getElementById("adminModeButton")
        ?.addEventListener(
            "click",
            () => selectLoginMode("admin")
        );

    document
        .getElementById("userLoginButton")
        ?.addEventListener(
            "click",
            loginAsUser
        );

    document
        .getElementById("adminLoginButton")
        ?.addEventListener(
            "click",
            loginAsAdmin
        );

    document
        .getElementById("userBackButton")
        ?.addEventListener(
            "click",
            backToChoice
        );

    document
        .getElementById("adminBackButton")
        ?.addEventListener(
            "click",
            backToChoice
        );


    /* =====================================================
       TOUCHE ENTREE
    ====================================================== */

    userInput?.addEventListener(
        "keydown",
        event => {

            if(event.key === "Enter"){
                loginAsUser();
            }
        }
    );

    adminInput?.addEventListener(
        "keydown",
        event => {

            if(event.key === "Enter"){
                adminPassword?.focus();
            }
        }
    );

    adminPassword?.addEventListener(
        "keydown",
        event => {

            if(event.key === "Enter"){
                loginAsAdmin();
            }
        }
    );


    /* =====================================================
       GESTION DES ERREURS SERVEUR

       app.js attendait auparavant un élément loginError.
       On intercepte uniquement les erreurs d'authentification
       pour les afficher dans le bon formulaire.
    ====================================================== */

    if(typeof handleMessage === "function"){

        const originalHandleMessage =
            handleMessage;

        window.handleMessage =
            function(message){

                if(
                    message &&
                    (
                        message.type === "login-error" ||
                        message.type === "auth-error"
                    )
                ){

                    const targetError =
                        mode === "admin"
                            ? adminError
                            : userError;

                    if(targetError){
                        targetError.textContent =
                            message.message ||
                            "Connexion impossible.";
                    }

                    return;
                }

                originalHandleMessage(
                    message
                );
            };
    }


    /* =====================================================
       COMPATIBILITÉ AVEC LES ANCIENS APPELS
    ====================================================== */

    window.selectLoginMode =
        selectLoginMode;

    window.loginAsUser =
        loginAsUser;

    window.loginAsAdmin =
        loginAsAdmin;

    window.backToAuthChoice =
        backToChoice;

    window.login =
        function(){

            if(mode === "admin"){
                loginAsAdmin();
                return;
            }

            if(mode === "user"){
                loginAsUser();
                return;
            }

            selectLoginMode("user");
        };

})();
