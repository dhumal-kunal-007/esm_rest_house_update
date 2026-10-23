import {
  useEffect,
  useState,
} from "react";

import "../App.css";
import BrandLogo from "../components/BrandLogo";
import {
  apiFetch,
  saveAuthToken,
} from "../api";

import type {
  User,
  UserRole,
} from "../App";

import { useLanguage } from "../i18n/LanguageContext";


interface LoginProps {
  onLogin: (user: User) => void;
}


interface LoginResponse {
  success: boolean;
  message: string;
  token?: string;

  user?: {
    id: string;
    full_name: string;
    username: string;
    role_id: number;
    role_name: string;
    description: string;
  };
}


/* =========================================
   LOGIN ROLES
========================================= */

const roles: {
  value: UserRole;
  label: string;
  shortLabel: string;
}[] = [

  {
    value: "ADMIN",
    label: "Administrator",
    shortLabel: "Administrator",
  },

  {
    value: "DY_DIRECTOR",
    label: "Deputy Director",
    shortLabel: "Deputy Director",
  },

  {
    value: "SUPERINTENDENT",
    label: "Superintendent",
    shortLabel: "Superintendent",
  },

  {
    value: "WELFARE_ORGANISER",
    label: "Welfare Organizer",
    shortLabel: "Welfare Organizer",
  },

  {
    value: "OLC_REST_HOUSE_MANAGER",
    label: "OLC Rest House Manager",
    shortLabel: "OLC Rest House Manager",
  },

  {
    value: "RECEPTIONIST",
    label: "Receptionist",
    shortLabel: "Receptionist",
  },

];


/* =========================================
   LOCAL STORAGE KEYS
========================================= */

const SAVED_USERNAME_KEY =
  "esm-saved-username";

const REMEMBER_LOGIN_KEY =
  "esm-remember-login";

const SAVED_ROLE_KEY =
  "esm-saved-role";


/* =========================================
   COMPONENT
========================================= */

function Login({
  onLogin,
}: LoginProps) {

  const {
    language,
    setLanguage,
    t,
  } = useLanguage();


  const [
    selectedRole,
    setSelectedRole,
  ] = useState<UserRole | "">("");


  const [
    username,
    setUsername,
  ] = useState("");


  const [
    password,
    setPassword,
  ] = useState("");


  const [
    showPassword,
    setShowPassword,
  ] = useState(false);


  const [
    rememberLogin,
    setRememberLogin,
  ] = useState(false);


  const [
    error,
    setError,
  ] = useState("");


  const [
    isLoading,
    setIsLoading,
  ] = useState(false);


  /* =========================================
     TRANSLATION HELPERS
  ========================================= */

  const roleLabels: Record<UserRole, string> = {
    ADMIN:
      language === "mr"
        ? "प्रशासक"
        : "Administrator",

    DY_DIRECTOR:
      language === "mr"
        ? "उपसंचालक"
        : "Deputy Director",

    SUPERINTENDENT:
      language === "mr"
        ? "अधीक्षक"
        : "Superintendent",

    WELFARE_ORGANISER:
      language === "mr"
        ? "कल्याण संघटक"
        : "Welfare Organizer",

    OLC_REST_HOUSE_MANAGER:
      language === "mr"
        ? "OLC विश्रामगृह व्यवस्थापक"
        : "OLC Rest House Manager",

    RECEPTIONIST:
      language === "mr"
        ? "स्वागत कक्ष अधिकारी"
        : "Receptionist",
  };


  /* =========================================
     LOAD SAVED LOGIN
  ========================================= */

  useEffect(() => {

    const savedUsername =
      localStorage.getItem(
        SAVED_USERNAME_KEY
      );

    const savedRemember =
      localStorage.getItem(
        REMEMBER_LOGIN_KEY
      );

    const savedRole =
      localStorage.getItem(
        SAVED_ROLE_KEY
      );


    if (savedRemember === "true") {

      // Initialize persisted login preference when the page first opens.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRememberLogin(true);

    }


    if (savedUsername) {

      setUsername(
        savedUsername
      );

    }


    localStorage.removeItem(
      "esm-saved-password"
    );


    if (
      savedRole &&
      roles.some(
        (role) =>
          role.value === savedRole
      )
    ) {

      setSelectedRole(
        savedRole as UserRole
      );

    }

  }, []);


  /* =========================================
     SAVE / CLEAR REMEMBERED LOGIN
  ========================================= */

  const saveLoginDetails = () => {

    if (!rememberLogin) {

      localStorage.removeItem(
        SAVED_USERNAME_KEY
      );

      localStorage.removeItem(
        SAVED_ROLE_KEY
      );

      localStorage.setItem(
        REMEMBER_LOGIN_KEY,
        "false"
      );

      return;
    }


    localStorage.setItem(
      SAVED_USERNAME_KEY,
      username.trim()
    );


    localStorage.setItem(
      SAVED_ROLE_KEY,
      selectedRole
    );


    localStorage.setItem(
      REMEMBER_LOGIN_KEY,
      "true"
    );

  };


  /* =========================================
     LOGIN
  ========================================= */

  const handleLogin = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {

    event.preventDefault();

    setError("");


    /* -------------------------------
       ROLE VALIDATION
    -------------------------------- */

    if (!selectedRole) {

      setError(
        t("login", "selectRoleError")
      );

      return;
    }


    /* -------------------------------
       USERNAME VALIDATION
    -------------------------------- */

    if (!username.trim()) {

      setError(
        t("login", "usernameError")
      );

      return;
    }


    /* -------------------------------
       PASSWORD VALIDATION
    -------------------------------- */

    if (!password) {

      setError(
        t("login", "passwordError")
      );

      return;
    }


    setIsLoading(true);


    try {

      const response =
        await apiFetch(
          "http://localhost:5000/api/auth/login",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({

                username:
                  username.trim(),

                password,

              }),

          }
        );


      let data:
        LoginResponse;


      try {

        data =
          await response.json();

      } catch {

        setError(
          t("login", "invalidServerResponse")
        );

        return;
      }


      /* -------------------------------
         LOGIN FAILED
      -------------------------------- */

      if (
        !response.ok ||
        !data.success ||
        !data.user ||
        !data.token
      ) {

        setError(
          data.message ||
          t("login", "invalidCredentials")
        );

        return;
      }


      /* -------------------------------
         ROLE VERIFICATION
      -------------------------------- */

      if (
        data.user.role_name !==
        selectedRole
      ) {

        setError(
          t("login", "roleMismatch")
        );

        return;
      }

      saveAuthToken(data.token);

      /* -------------------------------
         SAVE LOGIN
      -------------------------------- */

      saveLoginDetails();


      /* -------------------------------
         CREATE FRONTEND USER
      -------------------------------- */

      const loggedInUser:
        User = {

        id:
          data.user.id,

        name:
          data.user.full_name,

        username:
          data.user.username,

        role:
          data.user.role_name as UserRole,

        active:
          true,

      };


      /* -------------------------------
         SEND USER TO APP
      -------------------------------- */

      onLogin(
        loggedInUser
      );

    } catch (requestError) {

      console.error(
        "Login request failed:",
        requestError
      );


      setError(
        t("login", "backendConnectionError")
      );

    } finally {

      setIsLoading(false);

    }

  };


  /* =========================================
     FORGOT PASSWORD
  ========================================= */

  const handleForgotPassword = () => {

    setError(
      t("login", "forgotPasswordMessage")
    );

  };


  /* =========================================
     UI
  ========================================= */

  return (

    <main className="modern-login-screen">

      {/* -------------------------------------
          BACKGROUND DECORATION
      -------------------------------------- */}

      <div className="login-background-shape login-shape-one" />

      <div className="login-background-shape login-shape-two" />

      <div className="login-background-shape login-shape-three" />


      {/* -------------------------------------
          MAIN LOGIN CONTAINER
      -------------------------------------- */}

      <div className="modern-login-shell">


        {/* =================================
            BRAND PANEL
        ================================== */}

        <section className="login-brand-panel">

          <div className="login-brand-top">

            <BrandLogo className="login-brand-mark" />

            <div>

              <span className="login-brand-mini">
                {language === "mr"
                  ? "शासकीय विश्रामगृह"
                  : "GOVERNMENT REST HOUSE"}
              </span>

              <h1>
                ESM REST HOUSE
              </h1>

            </div>

          </div>


          <div className="login-brand-main">

            <span className="login-brand-overline">
              {language === "mr"
                ? "सुरक्षित व्यवस्थापन पोर्टल"
                : "SECURE MANAGEMENT PORTAL"}
            </span>

            <h2>
              {language === "mr" ? (
                <>
                  निवास व्यवस्था
                  <br />
                  आता सोपी.
                </>
              ) : (
                <>
                  Accommodation
                  <br />
                  made simple.
                </>
              )}
            </h2>

            <p>
              {language === "mr"
                ? "बुकिंग, खोल्या, बेड, पाहुण्यांचे आगमन, निर्गमन आणि हाऊसकीपिंग एका सुरक्षित प्रणालीतून व्यवस्थापित करा."
                : "Manage bookings, rooms, beds, guest arrivals, departures and housekeeping from one secure platform."}
            </p>


            <div className="login-brand-features">

              <div className="login-feature">

                <span className="login-feature-icon">
                  ✓
                </span>

                <div>

                  <strong>
                    {language === "mr"
                      ? "केंद्रीकृत व्यवस्थापन"
                      : "Centralized Management"}
                  </strong>

                  <small>
                    {language === "mr"
                      ? "संपूर्ण विश्रामगृहाच्या कामकाजासाठी एकच प्रणाली."
                      : "One system for the entire rest house operation."}
                  </small>

                </div>

              </div>


              <div className="login-feature">

                <span className="login-feature-icon">
                  ◆
                </span>

                <div>

                  <strong>
                    {language === "mr"
                      ? "भूमिकेनुसार प्रवेश"
                      : "Role-Based Access"}
                  </strong>

                  <small>
                    {language === "mr"
                      ? "आपल्या अधिकृत जबाबदारीनुसार प्रवेश नियंत्रित केला जातो."
                      : "Access is controlled according to your official responsibility."}
                  </small>

                </div>

              </div>


              <div className="login-feature">

                <span className="login-feature-icon">
                  ↗
                </span>

                <div>

                  <strong>
                    {language === "mr"
                      ? "थेट खोली व्यवस्थापन"
                      : "Live Room Management"}
                  </strong>

                  <small>
                    {language === "mr"
                      ? "खोली आणि बेडची उपलब्धता रिअल टाइममध्ये पहा."
                      : "Monitor room and bed availability in real time."}
                  </small>

                </div>

              </div>

            </div>

          </div>


          <div className="login-brand-footer">

            <span>
              {language === "mr"
                ? "ESM विश्रामगृह • पुणे"
                : "ESM Rest House • Pune"}
            </span>

            <span>
              {language === "mr"
                ? "अधिकृत कर्मचारी"
                : "Authorized Personnel"}
            </span>

          </div>

        </section>


        {/* =================================
            LOGIN PANEL
        ================================== */}

        <section className="modern-login-panel">


          {/* LANGUAGE SWITCHER */}

          <div
            className="language-switcher"
            aria-label="Language selection"
          >

            <button
              type="button"
              className={`language-button ${
                language === "en"
                  ? "active"
                  : ""
              }`}
              onClick={() =>
                setLanguage("en")
              }
            >
              English
            </button>

            <span className="language-divider">
              |
            </span>

            <button
              type="button"
              className={`language-button ${
                language === "mr"
                  ? "active"
                  : ""
              }`}
              onClick={() =>
                setLanguage("mr")
              }
            >
              मराठी
            </button>

          </div>


          <div className="login-panel-header">

            <div className="login-panel-icon">
              →
            </div>

            <div>

              <span>
                {language === "mr"
                  ? "सुरक्षित प्रवेश"
                  : "SECURE ACCESS"}
              </span>

              <h2>
                {language === "mr"
                  ? "पुन्हा स्वागत आहे"
                  : "Welcome back"}
              </h2>

              <p>
                {language === "mr"
                  ? "व्यवस्थापन पोर्टलवर जाण्यासाठी साइन इन करा."
                  : "Sign in to continue to the management portal."}
              </p>

            </div>

          </div>


          {/* ---------------------------------
              ERROR
          ---------------------------------- */}

          {error && (

            <div
              className="modern-login-error"
              role="alert"
            >

              <span className="login-error-icon">
                !
              </span>

              <div>

                <strong>
                  {language === "mr"
                    ? "साइन इन करता आले नाही"
                    : "Unable to sign in"}
                </strong>

                <p>
                  {error}
                </p>

              </div>

            </div>

          )}


          {/* ---------------------------------
              FORM
          ---------------------------------- */}

          <form
            className="modern-login-form"
            onSubmit={handleLogin}
          >


            {/* ROLE */}

            <div className="modern-form-group">

              <label htmlFor="role">
                {language === "mr"
                  ? "लॉगिन भूमिका"
                  : "Login As"}
              </label>

              <div className="modern-input-wrapper">

                <span className="modern-input-icon">
                  ◉
                </span>

                <select
                  id="role"
                  value={selectedRole}
                  onChange={(event) => {

                    setSelectedRole(
                      event.target.value as UserRole
                    );

                    setError("");

                  }}
                  disabled={isLoading}
                  required
                >

                  <option value="">
                    {language === "mr"
                      ? "आपली अधिकृत भूमिका निवडा"
                      : "Select your official role"}
                  </option>

                  {roles.map(
                    (role) => (

                      <option
                        key={
                          role.value
                        }
                        value={
                          role.value
                        }
                      >
                        {
                          roleLabels[
                            role.value
                          ]
                        }
                      </option>

                    )
                  )}

                </select>

              </div>

            </div>


            {/* USERNAME */}

            <div className="modern-form-group">

              <div className="modern-label-row">

                <label htmlFor="username">
                  {language === "mr"
                    ? "वापरकर्तानाव"
                    : "Username"}
                </label>

                {username && (

                  <button
                    type="button"
                    className="clear-field-button"
                    onClick={() => {

                      setUsername("");

                      if (!rememberLogin) {

                        localStorage.removeItem(
                          SAVED_USERNAME_KEY
                        );

                      }

                    }}
                    tabIndex={-1}
                  >
                    {language === "mr"
                      ? "पुसून टाका"
                      : "Clear"}
                  </button>

                )}

              </div>


              <div className="modern-input-wrapper">

                <span className="modern-input-icon">
                  @
                </span>

                <input
                  id="username"
                  type="text"
                  placeholder={
                    language === "mr"
                      ? "आपले वापरकर्तानाव प्रविष्ट करा"
                      : "Enter your username"
                  }
                  value={username}
                  onChange={(event) => {

                    setUsername(
                      event.target.value
                    );

                    setError("");

                  }}
                  autoComplete="username"
                  disabled={isLoading}
                  autoFocus
                  required
                />

              </div>

            </div>


            {/* PASSWORD */}

            <div className="modern-form-group">

              <label htmlFor="password">
                {language === "mr"
                  ? "पासवर्ड"
                  : "Password"}
              </label>


              <div className="modern-input-wrapper">

                <span className="modern-input-icon">
                  •••
                </span>

                <input
                  id="password"
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  placeholder={
                    language === "mr"
                      ? "आपला पासवर्ड प्रविष्ट करा"
                      : "Enter your password"
                  }
                  value={password}
                  onChange={(event) => {

                    setPassword(
                      event.target.value
                    );

                    setError("");

                  }}
                  autoComplete="current-password"
                  disabled={isLoading}
                  required
                />


                <button
                  type="button"
                  className="password-toggle-button"
                  onClick={() =>
                    setShowPassword(
                      (current) =>
                        !current
                    )
                  }
                  disabled={isLoading}
                  aria-label={
                    showPassword
                      ? (
                        language === "mr"
                          ? "पासवर्ड लपवा"
                          : "Hide password"
                      )
                      : (
                        language === "mr"
                          ? "पासवर्ड दाखवा"
                          : "Show password"
                      )
                  }
                >

                  {showPassword
                    ? (
                      language === "mr"
                        ? "लपवा"
                        : "Hide"
                    )
                    : (
                      language === "mr"
                        ? "दाखवा"
                        : "Show"
                    )}

                </button>

              </div>

            </div>


            {/* REMEMBER OPTIONS */}

            <div className="login-options">

              <label className="remember-login">

                <input
                  type="checkbox"
                  checked={
                    rememberLogin
                  }
                  onChange={(event) => {

                    const checked =
                      event.target.checked;

                    setRememberLogin(
                      checked
                    );


                    if (!checked) {

                      localStorage.removeItem(
                        SAVED_USERNAME_KEY
                      );

                      localStorage.removeItem(
                        SAVED_ROLE_KEY
                      );

                      localStorage.setItem(
                        REMEMBER_LOGIN_KEY,
                        "false"
                      );

                    }

                  }}
                  disabled={isLoading}
                />

                <span className="custom-checkbox">
                  ✓
                </span>

                <span>
                  {language === "mr"
                    ? "मला लक्षात ठेवा"
                    : "Remember me"}
                </span>

              </label>


              <button
                type="button"
                className="forgot-password-modern"
                onClick={
                  handleForgotPassword
                }
                disabled={isLoading}
              >
                {language === "mr"
                  ? "पासवर्ड विसरलात?"
                  : "Forgot password?"}
              </button>

            </div>


            {/* SECURITY NOTE */}

            {rememberLogin && (

              <div className="remember-note">

                <span>
                  🔒
                </span>

                <p>
                  {language === "mr"
                    ? "आपले लॉगिन तपशील या संगणकावर लक्षात ठेवले जातील."
                    : "Your login details will be remembered on this computer."}
                </p>

              </div>

            )}


            {/* SIGN IN */}

            <button
              type="submit"
              className="modern-login-button"
              disabled={isLoading}
            >

              {isLoading ? (

                <>

                  <span className="login-spinner" />

                  <span>
                    {language === "mr"
                      ? "साइन इन होत आहे..."
                      : "Signing in..."}
                  </span>

                </>

              ) : (

                <>

                  <span>
                    {language === "mr"
                      ? "सुरक्षितपणे साइन इन करा"
                      : "Sign in securely"}
                  </span>

                  <span className="login-button-arrow">
                    →
                  </span>

                </>

              )}

            </button>


          </form>


          {/* ---------------------------------
              FOOTER
          ---------------------------------- */}

          <div className="modern-login-panel-footer">

            <div>

              <span className="security-dot" />

              {language === "mr"
                ? "सुरक्षित कनेक्शन"
                : "Secure connection"}

            </div>

            <span>
              Version 0.1.0
            </span>

          </div>


        </section>

      </div>


      {/* -------------------------------------
          COPYRIGHT
      -------------------------------------- */}

      <div className="modern-login-copyright">

        {language === "mr"
          ? "ESM विश्रामगृह • पुणे"
          : "ESM REST HOUSE • PUNE"}

        <span />

        {language === "mr"
          ? "बुकिंग आणि व्यवस्थापन प्रणाली"
          : "BOOKING & MANAGEMENT SYSTEM"}

        <span />

        © 2026

      </div>


    </main>

  );
}


export default Login;