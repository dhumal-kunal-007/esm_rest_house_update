import type {
  ReactNode,
} from "react";

import {
  useEffect,
} from "react";


/* =========================================
   MODAL TYPES
========================================= */

export type AppModalType =
  | "confirm"
  | "success"
  | "error"
  | "warning"
  | "info";


/* =========================================
   PROPS
========================================= */

interface AppModalProps {

  type?: AppModalType;

  className?: string;

  title: string;

  message?: string;

  children?: ReactNode;

  confirmText?: string;

  cancelText?: string;

  onConfirm?: () => void;

  onCancel?: () => void;

  onClose?: () => void;

  loading?: boolean;

  showCancel?: boolean;

  closeOnOverlayClick?: boolean;

}


/* =========================================
   ICON
========================================= */

function getIcon(
  type: AppModalType
): string {

  switch (type) {

    case "success":
      return "✓";

    case "error":
      return "!";

    case "warning":
      return "⚠";

    case "info":
      return "i";

    case "confirm":
    default:
      return "?";

  }

}


/* =========================================
   MODAL
========================================= */

function AppModal({

  type = "info",

  className,

  title,

  message,

  children,

  confirmText = "Confirm",

  cancelText = "Cancel",

  onConfirm,

  onCancel,

  onClose,

  loading = false,

  showCancel = true,

  closeOnOverlayClick = true,

}: AppModalProps) {


  /* =========================================
     ESCAPE KEY
  ========================================= */

  useEffect(() => {

    const handleKeyDown = (
      event: KeyboardEvent
    ) => {

      if (
        event.key === "Escape" &&
        !loading
      ) {

        if (onCancel) {

          onCancel();

        } else if (onClose) {

          onClose();

        }

      }

    };


    document.addEventListener(
      "keydown",
      handleKeyDown
    );


    return () => {

      document.removeEventListener(
        "keydown",
        handleKeyDown
      );

    };

  }, [
    loading,
    onCancel,
    onClose,
  ]);


  /* =========================================
     OVERLAY CLICK
  ========================================= */

  const handleOverlayClick = (
    event:
      React.MouseEvent<HTMLDivElement>
  ) => {

    if (
      !closeOnOverlayClick ||
      loading
    ) {

      return;

    }


    if (
      event.target ===
      event.currentTarget
    ) {

      if (onCancel) {

        onCancel();

      } else if (onClose) {

        onClose();

      }

    }

  };


  /* =========================================
     CLOSE
  ========================================= */

  const handleClose = () => {

    if (loading) {

      return;

    }


    if (onCancel) {

      onCancel();

      return;

    }


    if (onClose) {

      onClose();

    }

  };


  return (

    <div
      className="app-modal-overlay"
      onMouseDown={
        handleOverlayClick
      }
    >

      <style>{`

        .app-modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 10000;

          display: flex;
          align-items: center;
          justify-content: center;

          padding: 20px;

          background:
            rgba(15, 23, 42, 0.58);

          backdrop-filter:
            blur(4px);

          animation:
            appModalOverlayIn
            0.16s ease-out;
        }


        @keyframes appModalOverlayIn {

          from {
            opacity: 0;
          }

          to {
            opacity: 1;
          }

        }


        .app-modal {
          width: 100%;
          max-width: 500px;

          background: #ffffff;

          border-radius: 18px;

          overflow: hidden;

          box-shadow:
            0 25px 70px
            rgba(15, 23, 42, 0.28);

          animation:
            appModalIn
            0.18s ease-out;
        }


        @keyframes appModalIn {

          from {
            opacity: 0;

            transform:
              translateY(12px)
              scale(0.98);
          }

          to {
            opacity: 1;

            transform:
              translateY(0)
              scale(1);
          }

        }


        .app-modal-approval-notice {
          max-width: 560px;
          border: 1px solid #d8e3f0;
          border-radius: 20px;
          box-shadow:
            0 28px 80px rgba(15, 23, 42, 0.32),
            0 8px 24px rgba(15, 23, 42, 0.12);
        }


        .app-modal-approval-notice .app-modal-header {
          padding: 21px 24px;
          background:
            linear-gradient(125deg, #173b63 0%, #285b8f 100%);
        }


        .app-modal-approval-notice .app-modal-icon {
          width: 42px;
          height: 42px;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.13);
        }


        .app-modal-approval-notice .app-modal-header h2 {
          font-size: 17px;
          letter-spacing: 0.01em;
        }


        .app-modal-approval-notice .app-modal-close {
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.1);
        }


        .app-modal-approval-notice .app-modal-close:hover {
          background: rgba(255, 255, 255, 0.2);
        }


        .app-modal-approval-notice .app-modal-body {
          max-height: min(62vh, 560px);
          overflow-y: auto;
          padding: 24px;
        }


        .app-modal-approval-notice .app-modal-message {
          color: #334155;
          font-size: 14px;
          line-height: 1.75;
          overflow-wrap: anywhere;
        }


        .app-modal-approval-notice .app-modal-footer {
          padding: 0 24px 24px;
        }


        .app-modal-approval-notice .app-modal-confirm {
          min-width: 112px;
          border-radius: 10px;
          padding: 11px 22px;
        }


        /* =====================================
           HEADER
        ===================================== */

        .app-modal-header {

          display: flex;

          align-items: center;

          justify-content:
            space-between;

          gap: 15px;

          padding:
            18px 20px;

          color: #ffffff;

          background:
            linear-gradient(
              135deg,
              #163a63,
              #285b8f
            );
        }


        .app-modal-title-area {

          display: flex;

          align-items: center;

          gap: 12px;

          min-width: 0;
        }


        .app-modal-icon {

          width: 40px;
          height: 40px;

          flex-shrink: 0;

          display: flex;

          align-items: center;

          justify-content: center;

          border-radius: 10px;

          background:
            rgba(
              255,
              255,
              255,
              0.15
            );

          border:
            1px solid
            rgba(
              255,
              255,
              255,
              0.18
            );

          color: #ffffff;

          font-size: 20px;

          font-weight: 800;
        }


        .app-modal-header h2 {

          margin: 0;

          color: #ffffff;

          font-size: 18px;

          font-weight: 750;

          line-height: 1.3;
        }


        .app-modal-close {

          width: 34px;
          height: 34px;

          flex-shrink: 0;

          border: none;

          border-radius: 8px;

          background:
            rgba(
              255,
              255,
              255,
              0.12
            );

          color: #ffffff;

          font-size: 20px;

          line-height: 1;

          cursor: pointer;

          transition:
            0.18s ease;
        }


        .app-modal-close:hover {

          background:
            rgba(
              255,
              255,
              255,
              0.22
            );
        }


        .app-modal-close:disabled {

          opacity: 0.5;

          cursor:
            not-allowed;
        }


        /* =====================================
           BODY
        ===================================== */

        .app-modal-body {

          padding:
            24px 24px 10px;
        }


        .app-modal-message {

          margin: 0;

          color: #475569;

          font-size: 14px;

          line-height: 1.6;

          white-space:
            pre-line;
        }


        .app-modal-content {

          margin-top: 16px;
        }


        /* =====================================
           FOOTER
        ===================================== */

        .app-modal-footer {

          display: flex;

          align-items: center;

          justify-content:
            flex-end;

          gap: 10px;

          padding:
            16px 24px 22px;
        }


        .app-modal-cancel {

          min-width: 90px;

          border:
            1px solid
            #cbd5e1;

          border-radius: 9px;

          padding:
            10px 16px;

          background: #ffffff;

          color: #334155;

          font-size: 13px;

          font-weight: 700;

          cursor: pointer;

          transition:
            0.18s ease;
        }


        .app-modal-cancel:hover {

          background: #f1f5f9;

          border-color:
            #94a3b8;
        }


        .app-modal-cancel:disabled {

          opacity: 0.5;

          cursor:
            not-allowed;
        }


        .app-modal-confirm {

          min-width: 125px;

          border: none;

          border-radius: 9px;

          padding:
            10px 18px;

          background:
            linear-gradient(
              135deg,
              #163a63,
              #24527e
            );

          color: #ffffff;

          font-size: 13px;

          font-weight: 700;

          cursor: pointer;

          box-shadow:
            0 4px 10px
            rgba(
              22,
              58,
              99,
              0.20
            );

          transition:
            0.18s ease;
        }


        .app-modal-confirm:hover {

          transform:
            translateY(-1px);

          box-shadow:
            0 6px 14px
            rgba(
              22,
              58,
              99,
              0.25
            );
        }


        .app-modal-confirm:disabled {

          opacity: 0.55;

          cursor:
            not-allowed;

          transform:
            none;
        }


        /* =====================================
           TYPE VARIANTS
        ===================================== */

        .app-modal-success
        .app-modal-icon {

          background:
            rgba(
              16,
              185,
              129,
              0.22
            );
        }


        .app-modal-error
        .app-modal-icon {

          background:
            rgba(
              244,
              63,
              94,
              0.22
            );
        }


        .app-modal-warning
        .app-modal-icon {

          background:
            rgba(
              245,
              158,
              11,
              0.22
            );
        }


        .app-modal-info
        .app-modal-icon {

          background:
            rgba(
              59,
              130,
              246,
              0.22
            );
        }


        /* =====================================
           RESPONSIVE
        ===================================== */

        @media (
          max-width: 600px
        ) {

          .app-modal-overlay {

            padding: 15px;

          }


          .app-modal {

            max-width:
              100%;

            border-radius:
              15px;
          }


          .app-modal-approval-notice .app-modal-header {
            padding: 17px 18px;
          }


          .app-modal-body {

            padding:
              20px 18px 8px;
          }


          .app-modal-approval-notice .app-modal-body {
            max-height: 60vh;
            padding: 20px 18px;
          }


          .app-modal-footer {

            padding:
              14px 18px 18px;

            flex-direction:
              column-reverse;

            align-items:
              stretch;
          }


          .app-modal-cancel,
          .app-modal-confirm {

            width: 100%;
          }

        }

      `}</style>


      <div
        className={
          `app-modal app-modal-${type}${className ? ` ${className}` : ""}`
        }
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-modal-title"
      >


        {/* ===================================
            HEADER
        =================================== */}

        <header className="app-modal-header">

          <div
            className=
              "app-modal-title-area"
          >

            <div
              className=
                "app-modal-icon"
            >
              {
                getIcon(type)
              }
            </div>


            <h2
              id="app-modal-title"
            >
              {title}
            </h2>

          </div>


          <button
            type="button"
            className=
              "app-modal-close"
            onClick={
              handleClose
            }
            disabled={
              loading
            }
            aria-label="Close"
          >
            ×
          </button>

        </header>


        {/* ===================================
            BODY
        =================================== */}

        <div
          className=
            "app-modal-body"
        >

          {message && (

            <p
              className=
                "app-modal-message"
            >
              {message}
            </p>

          )}


          {children && (

            <div
              className=
                "app-modal-content"
            >
              {children}
            </div>

          )}

        </div>


        {/* ===================================
            FOOTER
        =================================== */}

        {(onConfirm ||
          onCancel ||
          onClose) && (

          <footer
            className=
              "app-modal-footer"
          >


            {showCancel &&
              (onCancel ||
                onClose) && (

              <button
                type="button"
                className=
                  "app-modal-cancel"
                onClick={
                  handleClose
                }
                disabled={
                  loading
                }
              >
                {cancelText}
              </button>

            )}


            {onConfirm && (

              <button
                type="button"
                className=
                  "app-modal-confirm"
                onClick={
                  onConfirm
                }
                disabled={
                  loading
                }
              >

                {loading
                  ? "Please wait..."
                  : confirmText}

              </button>

            )}

          </footer>

        )}

      </div>

    </div>

  );

}


export default AppModal;