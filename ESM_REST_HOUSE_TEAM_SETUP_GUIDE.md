# ESM Rest House Booking & Management System

## Team Setup Guide

This document explains how to set up the ESM Rest House Booking &
Management System on a new Windows laptop.

The project uses:

-   React + TypeScript frontend
-   Node.js + TypeScript backend
-   PostgreSQL database
-   pgAdmin 4 for database management
-   Git/GitHub for source-code sharing

> **Important:** The PostgreSQL database is shared as a `.backup` file.
> Team members do not need to manually run the SQL queries used during
> the original database setup, as long as the backup contains the
> required schema and data.

------------------------------------------------------------------------

# 1. What a New Team Member Needs

Each team member needs:

1.  Access to the GitHub repository
2.  The PostgreSQL backup file: `ESM_Rest_House.backup`
3.  Git
4.  Node.js LTS
5.  PostgreSQL 17
6.  pgAdmin 4

The GitHub repository contains the application source code.

The `.backup` file contains the PostgreSQL database that the application
uses.

------------------------------------------------------------------------

# 2. Install Required Software

## 2.1 Git

Install Git for Windows:

https://git-scm.com/download/win

After installation, open PowerShell and check:

``` powershell
git --version
```

A Git version number should be displayed.

------------------------------------------------------------------------

## 2.2 Node.js

Install the current Node.js LTS version:

https://nodejs.org/en/download/

After installation, open PowerShell and check:

``` powershell
node -v
npm -v
```

Both commands should display version numbers.

------------------------------------------------------------------------

## 2.3 PostgreSQL and pgAdmin 4

Install PostgreSQL for Windows:

https://www.postgresql.org/download/windows/

The PostgreSQL installer includes pgAdmin 4.

During installation:

-   Remember the PostgreSQL `postgres` user password.
-   Keep the default PostgreSQL port `5432` unless there is a specific
    reason to change it.
-   PostgreSQL 17 is the development environment used for this project.

Check that PostgreSQL is running before restoring the database.

------------------------------------------------------------------------

# 3. Get the Project from GitHub

Open PowerShell and run:

``` powershell
git clone https://github.com/dhumal-kunal-007/esm-rest-house-booking-management-system.git
```

Then enter the project folder:

``` powershell
cd esm-rest-house-booking-management-system
```

The project should contain folders such as:

``` text
backend
frontend
database
```

------------------------------------------------------------------------

# 4. Install Backend Dependencies

From the project root:

``` powershell
cd backend
npm install
```

Wait for npm to finish.

------------------------------------------------------------------------

# 5. Install Frontend Dependencies

Go back to the project root:

``` powershell
cd ..
cd frontend
npm install
```

Wait for npm to finish.

------------------------------------------------------------------------

# 6. Create the PostgreSQL Database

Open pgAdmin 4.

Go to:

``` text
Servers
└── PostgreSQL 17
    └── Databases
```

Right-click `Databases`.

Select:

``` text
Create → Database
```

Use:

``` text
Database name: ESM_Rest_House
```

Click **Save**.

Create an empty database only. The actual tables and data will be loaded
by restoring the backup.

------------------------------------------------------------------------

# 7. Restore the Database Backup

Make sure you have received:

``` text
ESM_Rest_House.backup
```

In pgAdmin 4:

1.  Right-click the newly created `ESM_Rest_House` database.
2.  Select **Restore...**
3.  Select the backup file: `ESM_Rest_House.backup`
4.  Make sure the backup format is recognized as **Custom**.
5.  Click **Restore**.
6.  Wait for the restore operation to finish successfully.

After the restore, refresh the database in pgAdmin.

You should see the project's database objects under:

``` text
Schemas
└── public
    ├── Tables
    ├── Functions
    └── other database objects
```

The database backup should provide the schema and data that existed when
the backup was created.

## Do not manually recreate the original database

Do not run the old setup SQL queries again unless the team specifically
creates a new database migration or a future developer instructs you to
do so.

------------------------------------------------------------------------

# 8. Create the Backend `.env` File

The project's `.env` file is intentionally not stored in GitHub because
it contains local database credentials.

Inside:

``` text
esm-rest-house-booking-management-system
└── backend
```

create a new file named:

``` text
.env
```

Put the following in it:

``` env
PORT=5000

DB_HOST=localhost
DB_PORT=5432
DB_NAME=ESM_Rest_House
DB_USER=postgres
DB_PASSWORD=YOUR_LOCAL_POSTGRES_PASSWORD
AUTH_TOKEN_SECRET=GENERATE_A_RANDOM_SECRET_AT_LEAST_32_BYTES
```

Replace:

``` text
YOUR_LOCAL_POSTGRES_PASSWORD
```

with the PostgreSQL `postgres` password created on that teammate's own
laptop.

Generate `AUTH_TOKEN_SECRET` locally with:

``` powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Keep this value private. If it is omitted, the backend uses a random
temporary signing key; restarting the backend then invalidates existing
login tokens, and users must log in again. Login tokens expire after
eight hours.

## Important

Do not upload the `.env` file to GitHub.

Do not share your personal PostgreSQL password.

Every developer should use their own local PostgreSQL credentials.

Example templates are available in `backend/.env.example` and
`frontend/.env.example`. Copy each one to `.env` in its respective
directory and replace the placeholders with local values. Never commit
real database credentials or token secrets.

------------------------------------------------------------------------

# 9. Start the Backend

Open PowerShell.

Go to the backend folder:

``` powershell
cd esm-rest-house-booking-management-system\backend
```

Start the backend:

``` powershell
npm run dev
```

The backend uses port:

``` text
5000
```

Keep this terminal open while using the application.

The backend API is available at:

``` text
http://localhost:5000
```

The health endpoint is:

``` text
http://localhost:5000/api/health
```

Opening the health endpoint in a browser should return the backend
health response.

The frontend API origin is configured with `VITE_API_BASE_URL` in
`frontend/.env`. For a deployed frontend, set it to the deployed backend
origin before building the frontend. Set `CORS_ORIGIN` in the backend
environment to the exact frontend origin; multiple origins may be
comma-separated. Use HTTPS and a private, stable `AUTH_TOKEN_SECRET` in
production.

------------------------------------------------------------------------

# 10. Start the Frontend

Open a second PowerShell window.

Go to the frontend folder:

``` powershell
cd esm-rest-house-booking-management-system\frontend
```

Start the frontend:

``` powershell
npm run dev
```

Vite will display the local frontend address in the terminal, normally
similar to:

``` text
http://localhost:5173
```

Open the displayed address in a browser.

Keep the frontend terminal open while using the application.

------------------------------------------------------------------------

# 11. Normal Development Setup

When both servers are running:

``` text
Browser
   │
   ▼
React Frontend
localhost:5173
   │
   ▼
Node/Express Backend
localhost:5000
   │
   ▼
PostgreSQL
localhost:5432
   │
   ▼
ESM_Rest_House
```

All of these services normally run on the developer's own laptop.

------------------------------------------------------------------------

# 12. Login

The restored database contains the user accounts that existed when the
backup was created.

The project currently includes accounts for the system roles:

``` text
ADMIN
DY_DIRECTOR
SUPERINTENDENT
WELFARE_ORGANISER
OLC_REST_HOUSE_MANAGER
RECEPTIONIST
```

Use the development credentials provided by the project owner/team lead.

Do not commit passwords to GitHub.

------------------------------------------------------------------------

# 13. Git Workflow for the Team

Before starting work each day, get the latest source code:

``` powershell
git pull origin main
```

Create or modify your assigned work.

Check what changed:

``` powershell
git status
```

Stage changes:

``` powershell
git add .
```

Commit:

``` powershell
git commit -m "Describe your changes"
```

Push:

``` powershell
git push origin main
```

## Recommended team practice

When multiple developers are working at the same time, coordinate before
pushing major changes.

For larger features, use a separate branch:

``` powershell
git checkout -b feature/your-feature-name
```

Then commit your changes and push the branch.

------------------------------------------------------------------------

# 14. Database Changes

The PostgreSQL database on each developer's laptop is separate.

For example:

``` text
Developer A
PostgreSQL → ESM_Rest_House

Developer B
PostgreSQL → ESM_Rest_House
```

These are two different local databases.

Changing a table on Developer A's laptop does not automatically change
Developer B's database.

## Important rule for future development

If a developer changes the database structure, such as:

-   adding a table
-   adding a column
-   changing a constraint
-   adding an index
-   changing a function
-   changing seed/reference data

the database change should be saved as a SQL migration/setup script and
committed to GitHub.

Do not rely on changes existing only inside one developer's local
pgAdmin database.

For future database changes, the team should agree on a migration
process before making major schema changes.

The current application includes
`backend/sql/migrations/20261001_feedback_notification_skipped.sql`.
After restoring an existing database, run this script once in pgAdmin's
Query Tool (connected to `ESM_Rest_House`) so feedback notifications can
store the `SKIPPED` status. The script preserves the existing
`PENDING`, `SENT`, and `FAILED` statuses. It is safe to run again.

Also run
`backend/sql/migrations/20261002_booking_pricing_snapshot.sql` once in
the same Query Tool before creating or approving bookings. This
additive migration creates a pricing snapshot table. The application
calculates the supported non-VIP rate on the server from the accepted
accommodation and booking dates, then uses that saved amount to validate
approval and payments. VIP remains unavailable until an approved rate is
configured. Existing bookings without a pricing snapshot cannot be newly
approved or paid through this flow; do not backfill their prices by
guessing.

Also run
`backend/sql/migrations/20261001_booking_service_member.sql` once. It
stores the serviceman number, rank, name, address, and identity number
submitted with each new booking; previously these required form values
were not persisted. This migration does not modify existing bookings.

Also run
`backend/sql/migrations/20261003_booking_workflow_progress.sql` once. It
stores the current step for an unfinished booking and lightweight draft
selection data so the booking creator can resume the same booking after
signing in again. Existing booking, guest, acceptance, and pricing records
remain unchanged. The dashboard and resume API require this table.

Also run
`backend/sql/migrations/20261005_shared_bill_invoice_number.sql` once.
It updates the existing `generate_bill_number(checkout_date DATE)` function
so bills and invoices share its `MMDDXXXX` counter and skip numbers already
used by either table. Invoice numbers are generated by the backend; existing
bill and invoice numbers remain unchanged.

For the October application update, run
`backend/sql/migrations/20261026_safe_runtime_schema_compatibility.sql`
once after backing up the database. It adds the room usage/gender and guest
category fields used by the updated dashboard, booking, and report queries,
then backfills them from existing room notes, bookability, restrictions, and
guest gender. It does not retire rooms or change room capacities.

Do not run
`backend/sql/migrations/20261021_limit_nac_inventory_to_configured_rooms.sql`
against the live database without first confirming the affected rooms have
no active bookings or housekeeping work. It retires NAC 10 through NAC 13.
The upstream `20261020_room_inventory_and_gender_restrictions.sql` also
rewrites room inventory and should not be applied on top of the locally
applied safe inventory migration.

------------------------------------------------------------------------

# 15. Do Not Commit These Files/Folders

The following local/generated files should not be committed:

``` text
backend/.env
backend/node_modules/
frontend/node_modules/
frontend/dist/
```

The `.env` file contains local credentials.

`node_modules` contains installed dependencies and should be recreated
using:

``` powershell
npm install
```

The frontend `dist` directory is generated by the build process.

------------------------------------------------------------------------

# 16. Common Problems

## Problem: `npm` is not recognized

Node.js is not installed correctly or PowerShell was opened before
installation.

Close PowerShell, open a new PowerShell window, and run:

``` powershell
node -v
npm -v
```

If it still fails, reinstall Node.js LTS.

------------------------------------------------------------------------

## Problem: PostgreSQL connection error

Check:

1.  PostgreSQL is running.
2.  PostgreSQL is listening on port `5432`.
3.  The database name is exactly:

``` text
ESM_Rest_House
```

4.  The `.env` values are correct.
5.  `DB_PASSWORD` is the local PostgreSQL password.

------------------------------------------------------------------------

## Problem: Database does not contain tables after restore

Refresh the database in pgAdmin.

Check:

``` text
ESM_Rest_House
└── Schemas
    └── public
        └── Tables
```

If the restore failed, open the pgAdmin restore process/messages and
check the reported error.

Do not immediately run old SQL scripts on top of the database without
checking the restore error.

------------------------------------------------------------------------

## Problem: Port 5000 is already in use

Another application is using port `5000`.

Stop the application using that port, or coordinate a port change with
the team before changing the backend configuration.

------------------------------------------------------------------------

## Problem: Port 5173 is already in use

Vite may automatically choose another available port and display it in
the terminal.

Open the URL shown by Vite.

------------------------------------------------------------------------

## Problem: `git pull` causes conflicts

Do not delete files randomly.

Check:

``` powershell
git status
```

Then coordinate with the developer who made the conflicting changes.

------------------------------------------------------------------------

# 17. Quick Start Checklist

For a completely new laptop:

``` text
[ ] Install Git
[ ] Install Node.js LTS
[ ] Install PostgreSQL + pgAdmin 4
[ ] Clone GitHub repository
[ ] npm install in backend
[ ] npm install in frontend
[ ] Create ESM_Rest_House database
[ ] Restore ESM_Rest_House.backup
[ ] Create backend/.env
[ ] Start backend: npm run dev
[ ] Start frontend: npm run dev
[ ] Open the frontend URL
[ ] Test login
[ ] Test database connection
```

------------------------------------------------------------------------

# 18. Project Repository

GitHub repository:

https://github.com/dhumal-kunal-007/esm-rest-house-booking-management-system

Database backup:

``` text
ESM_Rest_House.backup
```

The database backup should be distributed separately from the Git
repository.

------------------------------------------------------------------------

# 19. Final Setup Structure

After setup, a developer's machine should approximately look like:

``` text
esm-rest-house-booking-management-system/
│
├── backend/
│   ├── src/
│   ├── package.json
│   ├── package-lock.json
│   └── .env                 ← local only, not committed
│
├── frontend/
│   ├── src/
│   ├── package.json
│   └── package-lock.json
│
└── database/
```

And separately:

``` text
PostgreSQL 17
└── ESM_Rest_House
    └── restored from ESM_Rest_House.backup
```

Once these are ready, the application can be developed locally by
running the backend and frontend development servers.

## Build the Windows desktop installer

From `frontend`, run:

```powershell
npm install
npm run package:win
```

The NSIS installer is written to `frontend/dist/`. The installed desktop
application uses the configured API origin (localhost by default); the
PostgreSQL database and backend API must be configured and running separately
before sign-in. Do not distribute a local `.env` file or database credentials
with the installer.

## Additional production configuration

Apply the SQL migrations in `backend/sql/migrations` in filename order before
deploying the updated backend. The rate-card table intentionally starts empty;
an ADMIN must configure room rates and capacities before a booking can be priced.
Rate cards use room rates for both room-based and bed-based accommodation;
there are no separate bed rates. New bookings require a document for the
booking person and each occupant, stored encrypted in PostgreSQL. The latest
migrations also add the booking person's mobile number used to prefill a `SELF`
occupant.
Apply `20261016_shared_invoice_numbering.sql` after the earlier migrations so
invoice and bill numbers both use the shared `MMDDXXXX` counter.
Apply `20261017_legacy_bill_rate_overrides.sql` to allow an ADMIN to authorize
an audited historical daily rate when a legacy booking has no saved pricing
snapshot. Do not enter an estimated rate; record the official tariff basis.
Apply `20261018_daily_report_snapshots.sql` to enable the daily report archive.
The backend saves one immutable-by-application snapshot at 9:00 PM Asia/Kolkata
for the preceding 24 hours, including occupancy, check-in/check-out activity,
and ADMIN-visible checkout feedback. Keep the backend service running for the
scheduled save; if it restarts later, it catches up any report dates missed
since the migration was applied.
Apply `20261019_weekly_monthly_report_snapshots.sql` after the daily snapshot
migration to enable Monday-Sunday weekly and calendar-month reports, generated
at 9:00 PM on Sunday and the final day of each month. The monthly report also
shows collected CASH and UPI totals for that month.
The whole-room allotment index allows each accepted guest to receive an active
allotment in the same room while the room-lock flow continues to prevent
overlapping bookings.
An ADMIN can change a room's AC/NAC/DM category and room number from Customize
Rates. The backend rejects the change while the room has an active/future
accepted booking, allotment, occupied/uncleared bed, or unfinished housekeeping
task. Changing a room to DM also requires at least one active bed. No migration
is needed for room category or room number updates.

Apply `20261020_final_room_inventory.sql` to provision the approved AC, NAC,
VIP, DM, and Hall inventory. DM gender restrictions are enforced during room
acceptance and allotment. DM 16 is a non-bookable store room; DM 17–20 are
non-bookable staff-capacity rooms. The migration preserves booking history and
defers capacity changes or retirement for rooms with active bookings, allotments,
non-available beds, or unfinished housekeeping. After those are cleared, rerun
the idempotent migration to finish deferred room changes.
The invoice generator uses the existing `bill_counters` row and emits the
shared `MMDDXXXX` number format.

Private booking documents are encrypted in PostgreSQL with AES-256-GCM. Set
`DOCUMENT_ENCRYPTION_KEY` in the backend's secret store to a randomly generated
32-byte key encoded as 64 hexadecimal characters. For example, generate one
locally with:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Do not commit or share this key. Keep a protected backup: previously stored
documents cannot be decrypted if the key is lost. UPI payments also require an
ADMIN to configure the payee name and UPI ID in the Availability screen.
