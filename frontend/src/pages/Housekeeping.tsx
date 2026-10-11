import {
  useCallback,
  useEffect,
  useState,
} from "react";

import "../App.css";
import { apiFetch } from "../api";
import { useLanguage } from "../i18n/LanguageContext";

interface HousekeepingTask {
  id: string;
  task_status: string;
  room_id: string;
  room_number: string;
  bed_id: string | null;
  bed_number: number | null;
  guest_id: string | null;
  guest_name: string | null;
  allotted_by_name: string | null;
  assigned_to_name: string | null;
  created_at: string;
  updated_at: string | null;
}

interface HousekeepingProps {
  userId: string;
  userName: string;
  userRole: string;
  onBack: () => void;
}

function Housekeeping({
  userId,
  userName,
  userRole,
  onBack,
}: HousekeepingProps) {
  const { language, setLanguage } = useLanguage();

  const [tasks, setTasks] =
    useState<HousekeepingTask[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [actionLoading, setActionLoading] =
    useState<string | null>(null);

  const [errorMessage, setErrorMessage] =
    useState("");

  const [successMessage, setSuccessMessage] =
    useState("");

  const [confirmation, setConfirmation] =
    useState<{
      task: HousekeepingTask;
      action: "assign" | "complete";
    } | null>(null);

  const isMarathi = language === "mr";

  const tr = (
    english: string,
    marathi: string
  ) => (isMarathi ? marathi : english);

  /* =========================================
     LOAD TASKS
  ========================================= */

  const loadTasks = useCallback(
    async () => {
      setLoading(true);
      setErrorMessage("");

      try {
        const response = await apiFetch(
          "http://localhost:5000/api/housekeeping/tasks"
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.message ||
              tr(
                "Unable to load housekeeping tasks.",
                "हाऊसकीपिंगची कामे लोड करता आली नाहीत."
              )
          );
        }

        setTasks(
          Array.isArray(data.tasks)
            ? data.tasks
            : []
        );
      } catch (error) {
        console.error(
          "Housekeeping task loading error:",
          error
        );

        setErrorMessage(
          error instanceof Error
            ? error.message
            : tr(
                "Unable to load housekeeping tasks. Please make sure the backend is running.",
                "हाऊसकीपिंगची कामे लोड करता आली नाहीत. कृपया बॅकएंड सुरू आहे याची खात्री करा."
              )
        );
      } finally {
        setLoading(false);
      }
    },
    [isMarathi]
  );

  /* =========================================
     INITIAL LOAD
  ========================================= */

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  /* =========================================
     CLEAR SUCCESS MESSAGE
  ========================================= */

  useEffect(() => {
    if (!successMessage) {
      return;
    }

    const timer = window.setTimeout(() => {
      setSuccessMessage("");
    }, 4000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [successMessage]);

  /* =========================================
     REQUEST ACTION
  ========================================= */

  const requestAction = (
    task: HousekeepingTask,
    action: "assign" | "complete"
  ) => {
    setErrorMessage("");
    setSuccessMessage("");

    setConfirmation({
      task,
      action,
    });
  };

  /* =========================================
     PERFORM ACTION
  ========================================= */

  const performAction = async () => {
    if (!confirmation) {
      return;
    }

    const { task, action } =
      confirmation;

    setActionLoading(task.id);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const endpoint =
        action === "assign"
          ? `http://localhost:5000/api/housekeeping/${task.id}/assign`
          : `http://localhost:5000/api/housekeeping/${task.id}/complete`;

      const body =
        action === "assign"
          ? {
              assigned_to: userId,
            }
          : {
              completed_by: userId,
            };

      const response = await apiFetch(
        endpoint,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify(body),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
            tr(
              "The housekeeping action could not be completed.",
              "हाऊसकीपिंगची प्रक्रिया पूर्ण करता आली नाही."
            )
        );
      }

      setConfirmation(null);

      const roomText =
        task.bed_number
          ? `${tr("Room", "खोली")} ${
              task.room_number
            }, ${tr("Bed", "बेड")} ${
              task.bed_number
            }`
          : `${tr("Room", "खोली")} ${
              task.room_number
            }`;

      if (action === "assign") {
        setSuccessMessage(
          isMarathi
            ? `${roomText} हाऊसकीपिंगकडे सोपवण्यात आली आहे.`
            : `${roomText} has been assigned to housekeeping.`
        );
      } else {
        setSuccessMessage(
          isMarathi
            ? `${roomText} ची साफसफाई पूर्ण झाली आहे. बेड आता उपलब्ध आहे.`
            : `Cleaning completed for ${roomText}. The bed is now available.`
        );
      }

      await loadTasks();
    } catch (error) {
      console.error(
        "Housekeeping action error:",
        error
      );

      setErrorMessage(
        error instanceof Error
          ? error.message
          : tr(
              "Unable to complete the housekeeping action.",
              "हाऊसकीपिंगची प्रक्रिया पूर्ण करता आली नाही."
            )
      );
    } finally {
      setActionLoading(null);
    }
  };

  /* =========================================
     STATUS LABEL
  ========================================= */

  const getStatusLabel = (
    status: string
  ) => {
    switch (status.toUpperCase()) {
      case "NEEDS CLEANING":
        return tr(
          "WAITING FOR HOUSEKEEPING",
          "हाऊसकीपिंगच्या प्रतीक्षेत"
        );

      case "CLEANING":
        return tr(
          "CLEANING IN PROGRESS",
          "साफसफाई सुरू आहे"
        );

      case "CLEARED":
        return tr(
          "CLEANING COMPLETED",
          "साफसफाई पूर्ण"
        );

      default:
        return status;
    }
  };

  /* =========================================
     STATUS CLASS
  ========================================= */

  const getStatusClass = (
    status: string
  ) => {
    switch (status.toUpperCase()) {
      case "NEEDS CLEANING":
        return "housekeeping-status-needs";

      case "CLEANING":
        return "housekeeping-status-cleaning";

      case "CLEARED":
        return "housekeeping-status-cleared";

      default:
        return "housekeeping-status-default";
    }
  };

  /* =========================================
     DATE FORMAT
  ========================================= */

  const formatDate = (
    value: string
  ) => {
    if (!value) {
      return "—";
    }

    const date = new Date(value);

    if (
      Number.isNaN(date.getTime())
    ) {
      return value;
    }

    return date.toLocaleString(
      isMarathi ? "mr-IN" : "en-IN",
      {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }
    );
  };

  /* =========================================
     COUNTS
  ========================================= */

  const waitingCount =
    tasks.filter(
      (task) =>
        task.task_status.toUpperCase() ===
        "NEEDS CLEANING"
    ).length;

  const cleaningCount =
    tasks.filter(
      (task) =>
        task.task_status.toUpperCase() ===
        "CLEANING"
    ).length;

  const completedCount =
    tasks.filter(
      (task) =>
        task.task_status.toUpperCase() ===
        "CLEARED"
    ).length;

  /* =========================================
     RENDER
  ========================================= */

  return (
    <main className="dashboard-screen">
      {/* HEADER */}

      <header className="dashboard-header">
        <div className="dashboard-brand">
          <button
            type="button"
            className="housekeeping-back-button"
            onClick={onBack}
          >
            ← {tr("Back", "मागे")}
          </button>

          <div className="dashboard-logo">
            ESM
          </div>

          <div>
            <h1>ESM REST HOUSE</h1>

            <p>
              {tr(
                "Housekeeping Management",
                "हाऊसकीपिंग व्यवस्थापन"
              )}
            </p>
          </div>
        </div>

        <div className="dashboard-user">
          <div className="user-info">
            <strong>{userName}</strong>

            <span>{userRole}</span>
          </div>

          <div className="language-switcher">
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
              EN
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
        </div>
      </header>

      {/* CONTENT */}

      <section className="dashboard-content">
        {/* PAGE TITLE */}

        <div className="dashboard-title">
          <div>
            <h2>
              {tr(
                "Housekeeping",
                "हाऊसकीपिंग"
              )}
            </h2>

            <p>
              {tr(
                "Manage rooms and beds waiting for cleaning after guest checkout.",
                "अतिथीच्या चेक-आउटनंतर साफसफाईच्या प्रतीक्षेत असलेल्या खोल्या आणि बेड व्यवस्थापित करा."
              )}
            </p>
          </div>

          <button
            type="button"
            className="housekeeping-refresh-button"
            onClick={loadTasks}
            disabled={loading}
          >
            {loading
              ? tr(
                  "Refreshing...",
                  "रिफ्रेश होत आहे..."
                )
              : tr(
                  "Refresh",
                  "रिफ्रेश"
                )}
          </button>
        </div>

        {/* MESSAGE */}

        {errorMessage && (
          <div className="housekeeping-message housekeeping-error">
            <strong>
              {tr(
                "Action Required",
                "कृती आवश्यक"
              )}
            </strong>

            <span>
              {errorMessage}
            </span>
          </div>
        )}

        {successMessage && (
          <div className="housekeeping-message housekeeping-success">
            <strong>
              {tr(
                "Success",
                "यशस्वी"
              )}
            </strong>

            <span>
              {successMessage}
            </span>
          </div>
        )}

        {/* SUMMARY CARDS */}

        <div className="dashboard-cards">
          <div className="stat-card">
            <span>
              {tr(
                "Waiting for Housekeeping",
                "हाऊसकीपिंगच्या प्रतीक्षेत"
              )}
            </span>

            <strong>
              {waitingCount}
            </strong>
          </div>

          <div className="stat-card">
            <span>
              {tr(
                "Cleaning in Progress",
                "साफसफाई सुरू आहे"
              )}
            </span>

            <strong>
              {cleaningCount}
            </strong>
          </div>

          <div className="stat-card">
            <span>
              {tr(
                "Cleaning Completed",
                "साफसफाई पूर्ण"
              )}
            </span>

            <strong>
              {completedCount}
            </strong>
          </div>

          <div className="stat-card">
            <span>
              {tr(
                "Total Tasks",
                "एकूण कामे"
              )}
            </span>

            <strong>
              {tasks.length}
            </strong>
          </div>
        </div>

        {/* HOUSEKEEPING PANEL */}

        <div className="dashboard-panel housekeeping-panel">
          <div className="panel-heading">
            <div>
              <h3>
                {tr(
                  "Housekeeping Tasks",
                  "हाऊसकीपिंगची कामे"
                )}
              </h3>

              <p>
                {tr(
                  "Rooms and beds requiring housekeeping attention.",
                  "हाऊसकीपिंगच्या कामाची आवश्यकता असलेल्या खोल्या आणि बेड."
                )}
              </p>
            </div>
          </div>

          {/* LOADING */}

          {loading ? (
            <div className="housekeeping-empty">
              <div className="housekeeping-spinner" />

              <p>
                {tr(
                  "Loading housekeeping tasks...",
                  "हाऊसकीपिंगची कामे लोड होत आहेत..."
                )}
              </p>
            </div>
          ) : tasks.length === 0 ? (
            /* NO TASKS */

            <div className="housekeeping-empty">
              <div className="housekeeping-empty-icon">
                ✓
              </div>

              <h4>
                {tr(
                  "No Pending Housekeeping Tasks",
                  "हाऊसकीपिंगची कोणतीही प्रलंबित कामे नाहीत"
                )}
              </h4>

              <p>
                {tr(
                  "All rooms and beds are currently clear for use.",
                  "सर्व खोल्या आणि बेड सध्या वापरासाठी उपलब्ध आहेत."
                )}
              </p>
            </div>
          ) : (
            /* TASK LIST */

            <div className="housekeeping-table-wrapper">
              <div className="housekeeping-table">
                {/* TABLE HEADER */}

                <div className="housekeeping-row housekeeping-table-header">
                  <span>
                    {tr(
                      "Room / Bed",
                      "खोली / बेड"
                    )}
                  </span>

                  <span>
                    {tr(
                      "Guest",
                      "अतिथी"
                    )}
                  </span>

                  <span>
                    {tr(
                      "Status",
                      "स्थिती"
                    )}
                  </span>

                  <span>
                    {tr(
                      "Task Created",
                      "काम तयार केले"
                    )}
                  </span>

                  <span>
                    {tr(
                      "Action",
                      "कृती"
                    )}
                  </span>
                </div>

                {/* TASKS */}

                {tasks.map((task) => (
                  <div
                    key={task.id}
                    className="housekeeping-row"
                  >
                    {/* ROOM / BED */}

                    <div className="housekeeping-room-cell">
                      <strong>
                        {task.room_number}
                      </strong>

                      {task.bed_number ? (
                        <span>
                          {tr(
                            "Bed",
                            "बेड"
                          )}{" "}
                          {task.bed_number}
                        </span>
                      ) : (
                        <span>
                          {tr(
                            "Room",
                            "खोली"
                          )}
                        </span>
                      )}
                    </div>

                    {/* GUEST */}

                    <div className="housekeeping-guest-cell">
                      <strong>
                        {task.guest_name ||
                          tr(
                            "Guest information unavailable",
                            "अतिथीची माहिती उपलब्ध नाही"
                          )}
                      </strong>

                      {task.allotted_by_name && (
                        <span>
                          {tr(
                            "Allotted by",
                            "अलॉटमेंट करणारे"
                          )}{" "}
                          {
                            task.allotted_by_name
                          }
                        </span>
                      )}
                    </div>

                    {/* STATUS */}

                    <div>
                      <span
                        className={`housekeeping-status ${getStatusClass(
                          task.task_status
                        )}`}
                      >
                        {getStatusLabel(
                          task.task_status
                        )}
                      </span>

                      {task.task_status.toUpperCase() ===
                        "CLEANING" &&
                        task.assigned_to_name && (
                        <small className="housekeeping-assigned-text">
                          {tr(
                            "Assigned to",
                            "सोपवले आहे"
                          )}{" "}
                          {
                            task.assigned_to_name
                          }
                        </small>
                      )}
                    </div>

                    {/* DATE */}

                    <div className="housekeeping-date-cell">
                      {formatDate(
                        task.created_at
                      )}
                    </div>

                    {/* ACTION */}

                    <div className="housekeeping-action-cell">
                      {task.task_status.toUpperCase() ===
                        "NEEDS CLEANING" && (
                        <button
                          type="button"
                          className="housekeeping-action-button housekeeping-assign-button"
                          onClick={() =>
                            requestAction(
                              task,
                              "assign"
                            )
                          }
                          disabled={
                            actionLoading ===
                            task.id
                          }
                        >
                          {actionLoading ===
                          task.id
                            ? tr(
                                "Processing...",
                                "प्रक्रिया सुरू आहे..."
                              )
                            : tr(
                                "Assign to Housekeeping",
                                "हाऊसकीपिंगकडे सोपवा"
                              )}
                        </button>
                      )}

                      {task.task_status.toUpperCase() ===
                        "CLEANING" && (
                        <button
                          type="button"
                          className="housekeeping-action-button housekeeping-complete-button"
                          onClick={() =>
                            requestAction(
                              task,
                              "complete"
                            )
                          }
                          disabled={
                            actionLoading ===
                            task.id
                          }
                        >
                          {actionLoading ===
                          task.id
                            ? tr(
                                "Processing...",
                                "प्रक्रिया सुरू आहे..."
                              )
                            : tr(
                                "Cleaning Completed",
                                "साफसफाई पूर्ण"
                              )}
                        </button>
                      )}

                      {task.task_status.toUpperCase() ===
                        "CLEARED" && (
                        <span className="housekeeping-completed-label">
                          ✓{" "}
                          {tr(
                            "Completed",
                            "पूर्ण"
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* WORKFLOW INFORMATION */}

        <div className="dashboard-panel housekeeping-workflow-panel">
          <h3>
            {tr(
              "Housekeeping Workflow",
              "हाऊसकीपिंग प्रक्रिया"
            )}
          </h3>

          <div className="housekeeping-workflow">
            <div className="workflow-step">
              <div className="workflow-number">
                1
              </div>

              <div>
                <strong>
                  {tr(
                    "Guest Checks Out",
                    "अतिथी चेक-आउट करतो"
                  )}
                </strong>

                <p>
                  {tr(
                    "The room/bed becomes",
                    "खोली/बेड"
                  )}{" "}
                  <b>
                    {tr(
                      "RED — Needs Cleaning",
                      "लाल — साफसफाई आवश्यक"
                    )}
                  </b>
                  .
                </p>
              </div>
            </div>

            <div className="workflow-arrow">
              →
            </div>

            <div className="workflow-step">
              <div className="workflow-number">
                2
              </div>

              <div>
                <strong>
                  {tr(
                    "Assign to Housekeeping",
                    "हाऊसकीपिंगकडे सोपवा"
                  )}
                </strong>

                <p>
                  {tr(
                    "Receptionist changes the status to",
                    "रिसेप्शनिस्ट स्थिती बदलून"
                  )}{" "}
                  <b>
                    {tr(
                      "YELLOW — Cleaning in Progress",
                      "पिवळा — साफसफाई सुरू"
                    )}
                  </b>
                  .
                </p>
              </div>
            </div>

            <div className="workflow-arrow">
              →
            </div>

            <div className="workflow-step">
              <div className="workflow-number">
                3
              </div>

              <div>
                <strong>
                  {tr(
                    "Cleaning Completed",
                    "साफसफाई पूर्ण"
                  )}
                </strong>

                <p>
                  {tr(
                    "Receptionist completes the task and the bed becomes",
                    "रिसेप्शनिस्ट काम पूर्ण केल्यानंतर बेड"
                  )}{" "}
                  <b>
                    {tr(
                      "GREEN — Available",
                      "हिरवा — उपलब्ध"
                    )}
                  </b>
                  .
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CONFIRMATION PANEL */}

      {confirmation && (
        <div className="housekeeping-confirmation-overlay">
          <div className="housekeeping-confirmation-card">
            <div className="housekeeping-confirmation-icon">
              ?
            </div>

            <h3>
              {confirmation.action ===
              "assign"
                ? tr(
                    "Assign Room to Housekeeping?",
                    "खोली हाऊसकीपिंगकडे सोपवायची आहे का?"
                  )
                : tr(
                    "Complete Cleaning?",
                    "साफसफाई पूर्ण करायची आहे का?"
                  )}
            </h3>

            <p>
              {confirmation.action ===
              "assign"
                ? isMarathi
                  ? `खोली ${confirmation.task.room_number}${
                      confirmation.task
                        .bed_number
                        ? `, बेड ${confirmation.task.bed_number}`
                        : ""
                    } ची स्थिती "साफसफाई सुरू" अशी केली जाईल.`
                  : `Room ${confirmation.task.room_number}${
                      confirmation.task
                        .bed_number
                        ? `, Bed ${confirmation.task.bed_number}`
                        : ""
                    } will be marked as Cleaning in Progress.`
                : isMarathi
                  ? `खोली ${confirmation.task.room_number}${
                      confirmation.task
                        .bed_number
                        ? `, बेड ${confirmation.task.bed_number}`
                        : ""
                    } ची साफसफाई पूर्ण झाल्यानंतर ती उपलब्ध केली जाईल.`
                  : `Room ${confirmation.task.room_number}${
                      confirmation.task
                        .bed_number
                        ? `, Bed ${confirmation.task.bed_number}`
                        : ""
                    } will be marked as Available after cleaning is completed.`}
            </p>

            <div className="housekeeping-confirmation-details">
              <div>
                <span>
                  {tr(
                    "Room",
                    "खोली"
                  )}
                </span>

                <strong>
                  {
                    confirmation.task
                      .room_number
                  }
                </strong>
              </div>

              {confirmation.task.bed_number && (
                <div>
                  <span>
                    {tr(
                      "Bed",
                      "बेड"
                    )}
                  </span>

                  <strong>
                    {
                      confirmation.task
                        .bed_number
                    }
                  </strong>
                </div>
              )}

              <div>
                <span>
                  {tr(
                    "Guest",
                    "अतिथी"
                  )}
                </span>

                <strong>
                  {confirmation.task
                    .guest_name ||
                    "—"}
                </strong>
              </div>
            </div>

            <div className="housekeeping-confirmation-actions">
              <button
                type="button"
                className="housekeeping-cancel-button"
                onClick={() =>
                  setConfirmation(null)
                }
                disabled={
                  actionLoading !== null
                }
              >
                {tr(
                  "Cancel",
                  "रद्द करा"
                )}
              </button>

              <button
                type="button"
                className="housekeeping-confirm-button"
                onClick={
                  performAction
                }
                disabled={
                  actionLoading !== null
                }
              >
                {actionLoading
                  ? tr(
                      "Processing...",
                      "प्रक्रिया सुरू आहे..."
                    )
                  : confirmation.action ===
                    "assign"
                    ? tr(
                        "Assign to Housekeeping",
                        "हाऊसकीपिंगकडे सोपवा"
                      )
                    : tr(
                        "Confirm Cleaning Completed",
                        "साफसफाई पूर्ण झाल्याची पुष्टी करा"
                      )}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default Housekeeping;