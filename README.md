# esm-rest-house-booking-management-system
A cross-platform desktop application for digitizing and managing the ESM Rest House, Pune's lodging, bed occupancy, lawn bookings, guest registration, daily registers, reporting, and administrative operations.

Updated repository: `esm_rest_house_update`

## Windows desktop releases and automatic updates

The Windows desktop installer bundles the frontend and backend. On the
first launch, the app asks for the backend `.env` file and stores a private
copy in the current Windows user's application data directory. It does not
include database credentials in the installer or upload them to GitHub.
PostgreSQL must be installed and running on the computer, and the selected
configuration must point to the intended database.

To create a GitHub release, update the frontend version in
`frontend/package.json`, commit and push the changes, then push a matching
version tag (for example, `v0.1.1`). The `Publish Windows desktop release`
workflow builds the installer and publishes the installer and update
metadata to the public `esm_rest_house_update` GitHub Releases page.

Installed copies check for updates when they start, download available
updates, and offer to restart to install them. The first version that
contains the updater must be installed manually; older installers cannot
update themselves. Later versions update through GitHub Releases.
