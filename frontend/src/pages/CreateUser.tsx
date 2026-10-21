import {
  useEffect,
  useState,
} from "react";

import "../App.css";
import { apiFetch } from "../api";

import type {
  User,
  UserRole,
} from "../App";

import { useLanguage } from "../i18n/LanguageContext";


/* =================================
   PROPS
================================== */

interface CreateUserProps {
  users: User[];

  onCreateUser: (
    user: User
  ) => void;

  onDeleteUser: (
    userId: string
  ) => void;

  currentUserId?: string;

  onBack: () => void;
}


/* =================================
   AVAILABLE ROLES
================================== */

const roles: {
  value: UserRole;
  label: string;
}[] = [
  {
    value: "ADMIN",
    label: "Administrator",
  },
  {
    value: "DY_DIRECTOR",
    label: "Deputy Director",
  },
  {
    value: "SUPERINTENDENT",
    label: "Superintendent",
  },
  {
    value: "WELFARE_ORGANISER",
    label: "Welfare Organizer",
  },
  {
    value: "OLC_REST_HOUSE_MANAGER",
    label: "OLC Rest House Manager",
  },
  {
    value: "RECEPTIONIST",
    label: "Receptionist",
  },
];


/* =================================
   COMPONENT
================================== */

function CreateUser({
  users,
  onCreateUser,
  onDeleteUser,
  currentUserId,
  onBack,
}: CreateUserProps) {

  const {
    language,
    setLanguage,
  } = useLanguage();


  /* =================================
     FORM STATE
  ================================== */

  const [
    name,
    setName,
  ] = useState("");

  const [
    username,
    setUsername,
  ] = useState("");

  const [
    password,
    setPassword,
  ] = useState("");

  const [
    role,
    setRole,
  ] = useState<UserRole>(
    "RECEPTIONIST"
  );

  const [
    error,
    setError,
  ] = useState("");

  const [
    creatingUser,
    setCreatingUser,
  ] = useState(false);

  const [
    removingUserId,
    setRemovingUserId,
  ] = useState<string | null>(
    null
  );


  /* =================================
     DATABASE USERS
  ================================== */

  const [
    databaseUsers,
    setDatabaseUsers,
  ] = useState<User[]>([]);

  const [
    loadingUsers,
    setLoadingUsers,
  ] = useState(true);


  /* =================================
     CONFIRMATION MODAL
  ================================== */

  const [
    confirmation,
    setConfirmation,
  ] = useState<{
    type:
      | "deactivate"
      | "permanent"
      | "success"
      | null;

    user?: User;

    message?: string;
  }>({
    type: null,
  });


  /* =================================
     TRANSLATIONS
  ================================== */

  const tr = (
    english: string,
    marathi: string
  ) =>
    language === "mr"
      ? marathi
      : english;


  const getRoleLabel = (
    userRole: UserRole
  ): string => {

    const roleLabels: Record<
      UserRole,
      string
    > = {

      ADMIN:
        tr(
          "Administrator",
          "प्रशासक"
        ),

      DY_DIRECTOR:
        tr(
          "Deputy Director",
          "उपसंचालक"
        ),

      SUPERINTENDENT:
        tr(
          "Superintendent",
          "अधीक्षक"
        ),

      WELFARE_ORGANISER:
        tr(
          "Welfare Organizer",
          "कल्याण संघटक"
        ),

      OLC_REST_HOUSE_MANAGER:
        tr(
          "OLC Rest House Manager",
          "OLC विश्रामगृह व्यवस्थापक"
        ),

      RECEPTIONIST:
        tr(
          "Receptionist",
          "स्वागत कक्ष अधिकारी"
        ),
    };

    return roleLabels[userRole];
  };


  /* =================================
     LOAD USERS
  ================================== */

  const loadUsers = async () => {

    try {

      setLoadingUsers(true);

      const response =
        await apiFetch(
          "http://localhost:5000/api/users"
        );

      const data =
        await response.json();

      if (!response.ok) {

        throw new Error(
          data.message ||
          "Failed to load users."
        );

      }

      if (
        !Array.isArray(
          data.users
        )
      ) {

        throw new Error(
          "Invalid user data received from server."
        );

      }

      const loadedUsers:
        User[] =
        data.users.map(
          (user: {
            id: string;
            name: string;
            username: string;
            role: string;
            active: boolean;
          }) => ({

            id:
              user.id,

            name:
              user.name,

            username:
              user.username,

            role:
              user.role as UserRole,

            active:
              user.active,

          })
        );


      setDatabaseUsers(
        loadedUsers
      );

    } catch (loadError) {

      console.error(
        "Failed to load users:",
        loadError
      );

      setDatabaseUsers(
        users
      );

    } finally {

      setLoadingUsers(false);

    }

  };


  /* =================================
     LOAD USERS WHEN PAGE OPENS
  ================================== */

  useEffect(() => {

    // This effect starts the initial async API load.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadUsers();

  }, []);


  /* =================================
     KEEP LIST IN SYNC
  ================================== */

  useEffect(() => {

    if (
      users.length > 0
    ) {

      // Preserve local edits while initializing from the latest parent data.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDatabaseUsers(
        (currentUsers) => {

          if (
            currentUsers.length > 0
          ) {

            return currentUsers;

          }

          return users;

        }
      );

    }

  }, [users]);


  /* =================================
     CREATE USER
  ================================== */

  const handleSubmit = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {

    event.preventDefault();

    setError("");


    /* NAME */

    if (!name.trim()) {

      setError(
        tr(
          "Please enter the full name.",
          "कृपया पूर्ण नाव प्रविष्ट करा."
        )
      );

      return;

    }


    /* USERNAME */

    if (!username.trim()) {

      setError(
        tr(
          "Please enter a username.",
          "कृपया वापरकर्तानाव प्रविष्ट करा."
        )
      );

      return;

    }


    /* USERNAME DUPLICATE */

    const usernameExists =
      databaseUsers.some(
        (user) =>
          user.username
            .toLowerCase() ===
          username
            .trim()
            .toLowerCase()
      );


    if (usernameExists) {

      setError(
        tr(
          "This username already exists.",
          "हे वापरकर्तानाव आधीपासून अस्तित्वात आहे."
        )
      );

      return;

    }


    /* PASSWORD */

    if (
      password.length < 6
    ) {

      setError(
        tr(
          "Password must contain at least 6 characters.",
          "पासवर्डमध्ये किमान 6 अक्षरे असणे आवश्यक आहे."
        )
      );

      return;

    }


    /* DOUBLE SUBMIT */

    if (
      creatingUser
    ) {

      return;

    }


    setCreatingUser(true);


    try {

      const response =
        await apiFetch(
          "http://localhost:5000/api/users",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({

                name:
                  name.trim(),

                username:
                  username.trim(),

                password,

                role,

              }),

          }
        );


      const data =
        await response.json();


      if (
        !response.ok
      ) {

        setError(
          data.message ||
          tr(
            "Failed to create user.",
            "वापरकर्ता तयार करता आला नाही."
          )
        );

        return;

      }


      if (
        !data.user
      ) {

        setError(
          tr(
            "User was created, but no user data was returned.",
            "वापरकर्ता तयार झाला, परंतु वापरकर्त्याची माहिती मिळाली नाही."
          )
        );

        return;

      }


      const createdUser:
        User = {

        id:
          data.user.id,

        name:
          data.user.name,

        username:
          data.user.username,

        role:
          data.user.role as UserRole,

        active:
          data.user.active,

      };


      /* UPDATE LIST */

      setDatabaseUsers(
        (currentUsers) => [
          ...currentUsers,
          createdUser,
        ]
      );


      onCreateUser(
        createdUser
      );


      /* CLEAR FORM */

      setName("");

      setUsername("");

      setPassword("");

      setRole(
        "RECEPTIONIST"
      );

      setError("");


      /* SUCCESS MODAL */

      setConfirmation({
        type: "success",
        message:
          tr(
            `User "${createdUser.username}" has been created successfully.`,
            `वापरकर्ता "${createdUser.username}" यशस्वीरित्या तयार करण्यात आला आहे.`
          ),
      });


    } catch (createError) {

      console.error(
        "Create user error:",
        createError
      );


      setError(
        tr(
          "Unable to connect to the backend. Please make sure the ESM Rest House backend is running.",
          "बॅकएंडशी कनेक्ट करता आले नाही. कृपया ESM विश्रामगृह बॅकएंड सुरू आहे याची खात्री करा."
        )
      );

    } finally {

      setCreatingUser(false);

    }

  };


  /* =================================
     DEACTIVATE USER
  ================================== */

  const handleDeleteUser = (
    user: User
  ) => {

    setError("");


    if (
      currentUserId &&
      user.id === currentUserId
    ) {

      setError(
        tr(
          "You cannot deactivate the currently logged-in user.",
          "सध्या लॉगिन केलेल्या वापरकर्त्याला निष्क्रिय करता येणार नाही."
        )
      );

      return;

    }


    if (
      !user.active
    ) {

      setError(
        tr(
          "This user is already inactive.",
          "हा वापरकर्ता आधीच निष्क्रिय आहे."
        )
      );

      return;

    }


    setConfirmation({
      type: "deactivate",
      user,
    });

  };


  /* =================================
     CONFIRM DEACTIVATION
  ================================== */

  const confirmDeactivation = () => {

    const user =
      confirmation.user;

    if (!user) {

      setConfirmation({
        type: null,
      });

      return;

    }


    onDeleteUser(
      user.id
    );


    setDatabaseUsers(
      (currentUsers) =>
        currentUsers.map(
          (currentUser) =>
            currentUser.id ===
            user.id
              ? {
                  ...currentUser,
                  active:
                    false,
                }
              : currentUser
        )
    );


    setConfirmation({
      type: null,
    });

  };


  /* =================================
     PERMANENT REMOVE
  ================================== */

  const handlePermanentRemove = (
    user: User
  ) => {

    setError("");


    if (
      currentUserId &&
      user.id === currentUserId
    ) {

      setError(
        tr(
          "You cannot permanently remove the currently logged-in user.",
          "सध्या लॉगिन केलेल्या वापरकर्त्याला कायमस्वरूपी काढता येणार नाही."
        )
      );

      return;

    }


    if (
      user.active
    ) {

      setError(
        tr(
          "Only inactive users can be permanently removed.",
          "फक्त निष्क्रिय वापरकर्त्यांना कायमस्वरूपी काढता येते."
        )
      );

      return;

    }


    setConfirmation({
      type: "permanent",
      user,
    });

  };


  /* =================================
     CONFIRM PERMANENT REMOVE
  ================================== */

  const confirmPermanentRemove =
    async () => {

      const user =
        confirmation.user;

      if (!user) {

        setConfirmation({
          type: null,
        });

        return;

      }


      setRemovingUserId(
        user.id
      );


      try {

        const response =
          await apiFetch(
            `http://localhost:5000/api/users/${user.id}/permanent`,
            {
              method: "DELETE",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body:
                JSON.stringify({
                  adminUserId:
                    currentUserId,
                }),

            }
          );


        const data =
          await response.json();


        if (
          !response.ok
        ) {

          setError(
            data.message ||
            tr(
              "Failed to permanently remove user.",
              "वापरकर्त्याला कायमस्वरूपी काढता आले नाही."
            )
          );

          setConfirmation({
            type: null,
          });

          return;

        }


        setDatabaseUsers(
          (currentUsers) =>
            currentUsers.filter(
              (currentUser) =>
                currentUser.id !==
                user.id
            )
        );


        setConfirmation({
          type: "success",
          message:
            tr(
              `User "${user.username}" has been permanently removed.`,
              `वापरकर्ता "${user.username}" कायमस्वरूपी काढून टाकण्यात आला आहे.`
            ),
        });


      } catch (removeError) {

        console.error(
          "Permanent user removal error:",
          removeError
        );


        setError(
          tr(
            "Unable to connect to the backend. Please make sure the ESM Rest House backend is running.",
            "बॅकएंडशी कनेक्ट करता आले नाही. कृपया ESM विश्रामगृह बॅकएंड सुरू आहे याची खात्री करा."
          )
        );

        setConfirmation({
          type: null,
        });

      } finally {

        setRemovingUserId(
          null
        );

      }

    };


  /* =================================
     DISPLAY USERS
  ================================== */

  const displayUsers =
    databaseUsers.length > 0
      ? databaseUsers
      : users;


  /* =================================
     RENDER
  ================================== */

  return (

    <main className="create-user-screen">

      <div className="create-user-card">


        {/* =================================
            HEADER
        ================================== */}

        <div className="create-user-header">

          <div>

            <span className="section-label">

              {tr(
                "ADMINISTRATOR",
                "प्रशासक"
              )}

            </span>

            <h1>

              {tr(
                "User Management",
                "वापरकर्ता व्यवस्थापन"
              )}

            </h1>

            <p>

              {tr(
                "Create, review and deactivate system user accounts.",
                "प्रणालीतील वापरकर्ता खाती तयार करा, तपासा आणि निष्क्रिय करा."
              )}

            </p>

          </div>


          <div
            style={{
              display:
                "flex",
              alignItems:
                "center",
              gap:
                "12px",
            }}
          >

            {/* LANGUAGE */}

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


            <button
              type="button"
              className="back-button"
              onClick={onBack}
            >

              ←{" "}
              {tr(
                "Back",
                "मागे"
              )}

            </button>

          </div>

        </div>


        {/* =================================
            USER LIST
        ================================== */}

        <section
          style={{
            marginBottom:
              "32px",
          }}
        >

          <div
            style={{
              display:
                "flex",
              justifyContent:
                "space-between",
              alignItems:
                "center",
              marginBottom:
                "16px",
            }}
          >

            <div>

              <h2
                style={{
                  margin: 0,
                }}
              >

                {tr(
                  "System Users",
                  "प्रणाली वापरकर्ते"
                )}

              </h2>

              <p
                style={{
                  margin:
                    "5px 0 0",
                  opacity: 0.7,
                }}
              >

                {loadingUsers

                  ? tr(
                      "Loading users...",
                      "वापरकर्ते लोड होत आहेत..."
                    )

                  : `${displayUsers.length} ${
                      displayUsers.length === 1
                        ? tr(
                            "user registered",
                            "वापरकर्ता नोंदणीकृत"
                          )
                        : tr(
                            "users registered",
                            "वापरकर्ते नोंदणीकृत"
                          )
                    }`

                }

              </p>

            </div>

          </div>


          <div
            style={{
              display:
                "grid",
              gap:
                "12px",
            }}
          >

            {loadingUsers ? (

              <div
                style={{
                  padding:
                    "24px",
                  textAlign:
                    "center",
                  border:
                    "1px dashed #ccd2dc",
                  borderRadius:
                    "12px",
                  opacity:
                    0.7,
                }}
              >

                {tr(
                  "Loading users from PostgreSQL...",
                  "PostgreSQL मधून वापरकर्ते लोड होत आहेत..."
                )}

              </div>

            ) : displayUsers.length === 0 ? (

              <div
                style={{
                  padding:
                    "24px",
                  textAlign:
                    "center",
                  border:
                    "1px dashed #ccd2dc",
                  borderRadius:
                    "12px",
                  opacity:
                    0.7,
                }}
              >

                {tr(
                  "No users found.",
                  "कोणतेही वापरकर्ते सापडले नाहीत."
                )}

              </div>

            ) : (

              displayUsers.map(
                (user) => (

                  <div
                    key={
                      user.id
                    }
                    style={{
                      display:
                        "grid",
                      gridTemplateColumns:
                        "minmax(180px, 1.4fr) minmax(140px, 1fr) minmax(170px, 1fr) auto",
                      gap:
                        "16px",
                      alignItems:
                        "center",
                      padding:
                        "16px 18px",
                      border:
                        "1px solid #e1e5eb",
                      borderRadius:
                        "12px",
                      background:
                        "#ffffff",
                    }}
                  >

                    {/* USER */}

                    <div>

                      <strong>
                        {
                          user.name
                        }
                      </strong>

                      <div
                        style={{
                          marginTop:
                            "4px",
                          fontSize:
                            "13px",
                          opacity:
                            0.65,
                        }}
                      >

                        @
                        {
                          user.username
                        }

                      </div>

                    </div>


                    {/* ROLE */}

                    <div>

                      <span
                        style={{
                          fontSize:
                            "13px",
                          fontWeight:
                            600,
                        }}
                      >

                        {
                          getRoleLabel(
                            user.role
                          )
                        }

                      </span>

                    </div>


                    {/* STATUS */}

                    <div>

                      <span
                        style={{
                          display:
                            "inline-flex",
                          alignItems:
                            "center",
                          padding:
                            "5px 10px",
                          borderRadius:
                            "999px",
                          fontSize:
                            "12px",
                          fontWeight:
                            700,
                          background:
                            user.active
                              ? "#eaf7ed"
                              : "#f3f3f3",
                          color:
                            user.active
                              ? "#26733b"
                              : "#777777",
                        }}
                      >

                        {
                          user.active
                            ? tr(
                                "ACTIVE",
                                "सक्रिय"
                              )
                            : tr(
                                "INACTIVE",
                                "निष्क्रिय"
                              )
                        }

                      </span>

                    </div>


                    {/* ACTION */}

                    {user.active ? (

                      <button
                        type="button"
                        onClick={() =>
                          handleDeleteUser(
                            user
                          )
                        }
                        disabled={
                          currentUserId ===
                          user.id
                        }
                        style={{
                          border:
                            "1px solid #d6a3a3",
                          background:
                            currentUserId ===
                            user.id
                              ? "#f3f3f3"
                              : "#fff5f5",
                          color:
                            currentUserId ===
                            user.id
                              ? "#999999"
                              : "#a12a2a",
                          padding:
                            "9px 14px",
                          borderRadius:
                            "8px",
                          fontWeight:
                            700,
                          fontSize:
                            "12px",
                          cursor:
                            currentUserId ===
                            user.id
                              ? "not-allowed"
                              : "pointer",
                        }}
                      >

                        {
                          currentUserId ===
                          user.id

                            ? tr(
                                "CURRENT USER",
                                "सध्याचा वापरकर्ता"
                              )

                            : tr(
                                "DEACTIVATE",
                                "निष्क्रिय करा"
                              )
                        }

                      </button>

                    ) : (

                      <button
                        type="button"
                        onClick={() =>
                          handlePermanentRemove(
                            user
                          )
                        }
                        disabled={
                          removingUserId ===
                          user.id
                        }
                        style={{
                          border:
                            "1px solid #c98b8b",
                          background:
                            "#fff0f0",
                          color:
                            "#8f1d1d",
                          padding:
                            "9px 14px",
                          borderRadius:
                            "8px",
                          fontWeight:
                            700,
                          fontSize:
                            "12px",
                          cursor:
                            removingUserId ===
                            user.id
                              ? "not-allowed"
                              : "pointer",
                        }}
                      >

                        {
                          removingUserId ===
                          user.id

                            ? tr(
                                "REMOVING...",
                                "काढून टाकत आहे..."
                              )

                            : tr(
                                "PERMANENTLY REMOVE",
                                "कायमस्वरूपी काढा"
                              )
                        }

                      </button>

                    )}

                  </div>

                )
              )

            )}

          </div>

        </section>


        {/* =================================
            CREATE USER
        ================================== */}

        <section>

          <div
            style={{
              marginBottom:
                "18px",
            }}
          >

            <h2
              style={{
                margin: 0,
              }}
            >

              {tr(
                "Create New User",
                "नवीन वापरकर्ता तयार करा"
              )}

            </h2>

            <p
              style={{
                margin:
                  "5px 0 0",
                opacity:
                  0.7,
              }}
            >

              {tr(
                "Create an account and assign the appropriate system role.",
                "खाते तयार करा आणि योग्य प्रणाली भूमिका नियुक्त करा."
              )}

            </p>

          </div>


          <form
            className="create-user-form"
            onSubmit={
              handleSubmit
            }
          >

            {/* FULL NAME */}

            <div className="form-group">

              <label htmlFor="name">

                {tr(
                  "Full Name",
                  "पूर्ण नाव"
                )}

              </label>

              <input
                id="name"
                type="text"
                placeholder={tr(
                  "Enter full name",
                  "पूर्ण नाव प्रविष्ट करा"
                )}
                value={
                  name
                }
                onChange={(
                  event
                ) =>
                  setName(
                    event.target.value
                  )
                }
                required
              />

            </div>


            {/* USERNAME */}

            <div className="form-group">

              <label htmlFor="new-username">

                {tr(
                  "Username",
                  "वापरकर्तानाव"
                )}

              </label>

              <input
                id="new-username"
                type="text"
                placeholder={tr(
                  "Create username",
                  "वापरकर्तानाव तयार करा"
                )}
                value={
                  username
                }
                onChange={(
                  event
                ) =>
                  setUsername(
                    event.target.value
                  )
                }
                required
              />

            </div>


            {/* PASSWORD */}

            <div className="form-group">

              <label htmlFor="new-password">

                {tr(
                  "Password",
                  "पासवर्ड"
                )}

              </label>

              <input
                id="new-password"
                type="password"
                placeholder={tr(
                  "Create password",
                  "पासवर्ड तयार करा"
                )}
                value={
                  password
                }
                onChange={(
                  event
                ) =>
                  setPassword(
                    event.target.value
                  )
                }
                required
              />

              <small
                style={{
                  display:
                    "block",
                  marginTop:
                    "6px",
                  opacity:
                    0.65,
                }}
              >

                {tr(
                  "Minimum 6 characters.",
                  "किमान 6 अक्षरे आवश्यक आहेत."
                )}

              </small>

            </div>


            {/* ROLE */}

            <div className="form-group">

              <label htmlFor="user-role">

                {tr(
                  "Assign Role",
                  "भूमिका नियुक्त करा"
                )}

              </label>

              <select
                id="user-role"
                value={
                  role
                }
                onChange={(
                  event
                ) =>
                  setRole(
                    event.target.value as UserRole
                  )
                }
                required
              >

                <option value="">

                  {tr(
                    "Select role",
                    "भूमिका निवडा"
                  )}

                </option>

                {
                  roles.map(
                    (
                      roleOption
                    ) => (

                      <option
                        key={
                          roleOption.value
                        }
                        value={
                          roleOption.value
                        }
                      >

                        {
                          getRoleLabel(
                            roleOption.value
                          )
                        }

                      </option>

                    )
                  )
                }

              </select>

            </div>


            {/* ERROR */}

            {error && (

              <div
                className="create-user-error"
              >

                {error}

              </div>

            )}


            {/* SUBMIT */}

            <button
              type="submit"
              className="create-user-button"
              disabled={
                creatingUser
              }
            >

              {
                creatingUser

                  ? tr(
                      "CREATING USER...",
                      "वापरकर्ता तयार होत आहे..."
                    )

                  : tr(
                      "CREATE USER",
                      "वापरकर्ता तयार करा"
                    )
              }

            </button>

          </form>

        </section>

      </div>


      {/* =================================
          CONFIRMATION MODAL
      ================================== */}

      {confirmation.type && (

        <div
          style={{
            position:
              "fixed",
            inset:
              0,
            background:
              "rgba(15, 23, 42, 0.55)",
            display:
              "flex",
            alignItems:
              "center",
            justifyContent:
              "center",
            zIndex:
              9999,
            padding:
              "20px",
          }}
          onClick={() =>
            confirmation.type === "success"
              ? setConfirmation({
                  type: null,
                })
              : undefined
          }
        >

          <div
            style={{
              width:
                "min(520px, 100%)",
              background:
                "#ffffff",
              borderRadius:
                "18px",
              padding:
                "28px",
              boxShadow:
                "0 24px 70px rgba(15,23,42,0.25)",
            }}
            onClick={(event) =>
              event.stopPropagation()
            }
          >

            {/* SUCCESS */}

            {confirmation.type === "success" && (

              <>

                <div
                  style={{
                    width:
                      "48px",
                    height:
                      "48px",
                    borderRadius:
                      "50%",
                    background:
                      "#eaf7ed",
                    color:
                      "#26733b",
                    display:
                      "flex",
                    alignItems:
                      "center",
                    justifyContent:
                      "center",
                    fontSize:
                      "24px",
                    fontWeight:
                      800,
                    marginBottom:
                      "16px",
                  }}
                >
                  ✓
                </div>

                <h2
                  style={{
                    margin:
                      "0 0 10px",
                  }}
                >

                  {tr(
                    "Success",
                    "यशस्वी"
                  )}

                </h2>

                <p
                  style={{
                    margin:
                      "0 0 24px",
                    lineHeight:
                      1.6,
                  }}
                >

                  {
                    confirmation.message
                  }

                </p>

                <button
                  type="button"
                  className="create-user-button"
                  onClick={() =>
                    setConfirmation({
                      type: null,
                    })
                  }
                >

                  {tr(
                    "OK",
                    "ठीक आहे"
                  )}

                </button>

              </>

            )}


            {/* DEACTIVATE */}

            {confirmation.type === "deactivate" &&
              confirmation.user && (

              <>

                <h2
                  style={{
                    margin:
                      "0 0 10px",
                  }}
                >

                  {tr(
                    "Deactivate User?",
                    "वापरकर्ता निष्क्रिय करायचा आहे का?"
                  )}

                </h2>

                <p
                  style={{
                    lineHeight:
                      1.6,
                    marginBottom:
                      "8px",
                  }}
                >

                  {tr(
                    `Are you sure you want to deactivate "${confirmation.user.name}" (${confirmation.user.username})?`,
                    `"${confirmation.user.name}" (${confirmation.user.username}) हा वापरकर्ता निष्क्रिय करायचा आहे का?`
                  )}

                </p>

                <p
                  style={{
                    lineHeight:
                      1.6,
                    opacity:
                      0.7,
                    marginBottom:
                      "24px",
                  }}
                >

                  {tr(
                    "The user will no longer be able to log in. Existing booking and approval history will be preserved.",
                    "हा वापरकर्ता यापुढे लॉगिन करू शकणार नाही. विद्यमान बुकिंग आणि मंजुरीचा इतिहास सुरक्षित राहील."
                  )}

                </p>

                <div
                  style={{
                    display:
                      "flex",
                    justifyContent:
                      "flex-end",
                    gap:
                      "10px",
                  }}
                >

                  <button
                    type="button"
                    className="back-button"
                    onClick={() =>
                      setConfirmation({
                        type: null,
                      })
                    }
                  >

                    {tr(
                      "Cancel",
                      "रद्द करा"
                    )}

                  </button>

                  <button
                    type="button"
                    onClick={
                      confirmDeactivation
                    }
                    style={{
                      border:
                        "none",
                      background:
                        "#a12a2a",
                      color:
                        "#ffffff",
                      padding:
                        "11px 18px",
                      borderRadius:
                        "8px",
                      fontWeight:
                        700,
                      cursor:
                        "pointer",
                    }}
                  >

                    {tr(
                      "Deactivate",
                      "निष्क्रिय करा"
                    )}

                  </button>

                </div>

              </>

            )}


            {/* PERMANENT REMOVE */}

            {confirmation.type === "permanent" &&
              confirmation.user && (

              <>

                <div
                  style={{
                    width:
                      "48px",
                    height:
                      "48px",
                    borderRadius:
                      "50%",
                    background:
                      "#fff0f0",
                    color:
                      "#8f1d1d",
                    display:
                      "flex",
                    alignItems:
                      "center",
                    justifyContent:
                      "center",
                    fontSize:
                      "22px",
                    fontWeight:
                      800,
                    marginBottom:
                      "16px",
                  }}
                >
                  !
                </div>

                <h2
                  style={{
                    margin:
                      "0 0 10px",
                  }}
                >

                  {tr(
                    "Permanently Remove User?",
                    "वापरकर्ता कायमस्वरूपी काढायचा आहे का?"
                  )}

                </h2>

                <p
                  style={{
                    lineHeight:
                      1.6,
                    marginBottom:
                      "8px",
                  }}
                >

                  <strong>
                    {tr(
                      "User:",
                      "वापरकर्ता:"
                    )}
                  </strong>{" "}

                  {
                    confirmation.user.name
                  }

                  <br />

                  <strong>
                    {tr(
                      "Username:",
                      "वापरकर्तानाव:"
                    )}
                  </strong>{" "}

                  {
                    confirmation.user.username
                  }

                  <br />

                  <strong>
                    {tr(
                      "Role:",
                      "भूमिका:"
                    )}
                  </strong>{" "}

                  {
                    getRoleLabel(
                      confirmation.user.role
                    )
                  }

                </p>

                <p
                  style={{
                    lineHeight:
                      1.6,
                    color:
                      "#8f1d1d",
                    fontWeight:
                      600,
                    marginBottom:
                      "24px",
                  }}
                >

                  {tr(
                    "This action will permanently remove the account from PostgreSQL and cannot be undone.",
                    "ही कृती PostgreSQL मधून खाते कायमस्वरूपी काढून टाकेल आणि पूर्ववत करता येणार नाही."
                  )}

                </p>

                <div
                  style={{
                    display:
                      "flex",
                    justifyContent:
                      "flex-end",
                    gap:
                      "10px",
                  }}
                >

                  <button
                    type="button"
                    className="back-button"
                    onClick={() =>
                      setConfirmation({
                        type: null,
                      })
                    }
                  >

                    {tr(
                      "Cancel",
                      "रद्द करा"
                    )}

                  </button>

                  <button
                    type="button"
                    onClick={
                      confirmPermanentRemove
                    }
                    disabled={
                      removingUserId !== null
                    }
                    style={{
                      border:
                        "none",
                      background:
                        "#8f1d1d",
                      color:
                        "#ffffff",
                      padding:
                        "11px 18px",
                      borderRadius:
                        "8px",
                      fontWeight:
                        700,
                      cursor:
                        removingUserId !== null
                          ? "not-allowed"
                          : "pointer",
                    }}
                  >

                    {
                      removingUserId

                        ? tr(
                            "Removing...",
                            "काढून टाकत आहे..."
                          )

                        : tr(
                            "Permanently Remove",
                            "कायमस्वरूपी काढा"
                          )
                    }

                  </button>

                </div>

              </>

            )}

          </div>

        </div>

      )}

    </main>

  );

}


export default CreateUser;