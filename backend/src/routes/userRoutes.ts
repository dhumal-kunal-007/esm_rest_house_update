import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { pool } from "../config/db.js";

const router = Router();


/* =========================================
   GET ALL USERS
========================================= */

router.get("/", async (_req: Request, res: Response) => {
    try {

        const result = await pool.query(
            `
            SELECT
                u.id,
                u.full_name,
                u.username,
                u.role_id,
                r.role_name,
                u.is_active,
                u.created_at,
                u.updated_at
            FROM users u
            INNER JOIN roles r
                ON r.id = u.role_id
            ORDER BY
                u.created_at ASC
            `
        );


        const users = result.rows.map((user) => ({
            id: user.id,
            name: user.full_name,
            username: user.username,
            role: user.role_name,
            active: user.is_active,
        }));


        return res.json({
            success: true,
            users,
        });

    } catch (error) {

        console.error(
            "Get users error:",
            error
        );


        return res.status(500).json({
            success: false,
            message:
                "Failed to load users.",
        });

    }
});

router.put(
    "/:userId/password",
    async (req: Request, res: Response) => {
        if (req.authUser?.role !== "ADMIN") {
            return res.status(403).json({
                success: false,
                message: "Only an ADMIN can reset user passwords.",
            });
        }

        const password = req.body?.password;
        if (typeof password !== "string" || password.length < 6) {
            return res.status(400).json({
                success: false,
                message: "Password must contain at least 6 characters.",
            });
        }

        try {
            const passwordHash = await bcrypt.hash(password, 10);
            const updateResult = await pool.query(
                `
                UPDATE users
                SET password_hash = $2,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
                RETURNING id
                `,
                [req.params.userId, passwordHash]
            );
            if (updateResult.rowCount === 0) {
                return res.status(404).json({
                    success: false,
                    message: "User not found.",
                });
            }

            return res.json({
                success: true,
                message: "Password reset successfully.",
            });
        } catch (error) {
            console.error("Reset user password error:", error);
            return res.status(500).json({
                success: false,
                message: "Failed to reset user password.",
            });
        }
    }
);


/* =========================================
   CREATE NEW USER
========================================= */

router.post(
    "/",
    async (req: Request, res: Response) => {

        if (req.authUser?.role !== "ADMIN") {
            return res.status(403).json({
                success: false,
                message:
                    "Only an ADMIN can create users.",
            });
        }

        const client =
            await pool.connect();

        try {

            const {
                name,
                username,
                password,
                role,
            } = req.body;


            /* =========================================
               VALIDATION
            ========================================= */

            if (
                !name ||
                !String(name).trim()
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Full name is required.",
                });

            }


            if (
                !username ||
                !String(username).trim()
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Username is required.",
                });

            }


            if (
                !password ||
                String(password).length < 6
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Password must contain at least 6 characters.",
                });

            }


            if (
                !role ||
                !String(role).trim()
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Role is required.",
                });

            }


            const cleanName =
                String(name).trim();

            const cleanUsername =
                String(username).trim();


            /* =========================================
               CHECK USERNAME
            ========================================= */

            const existingUser =
                await client.query(
                    `
                    SELECT
                        id
                    FROM users
                    WHERE LOWER(username) =
                          LOWER($1)
                    LIMIT 1
                    `,
                    [cleanUsername]
                );


            if (
                existingUser.rows.length > 0
            ) {

                return res.status(409).json({
                    success: false,
                    message:
                        "This username already exists.",
                });

            }


            /* =========================================
               FIND ROLE
            ========================================= */

            const roleResult =
                await client.query(
                    `
                    SELECT
                        id,
                        role_name
                    FROM roles
                    WHERE role_name = $1
                    LIMIT 1
                    `,
                    [String(role).trim()]
                );


            if (
                roleResult.rows.length === 0
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Selected role does not exist.",
                });

            }


            const selectedRole =
                roleResult.rows[0];


            /* =========================================
               HASH PASSWORD
            ========================================= */

            const passwordHash =
                await bcrypt.hash(
                    String(password),
                    10
                );


            /* =========================================
               INSERT USER
            ========================================= */

            await client.query(
                "BEGIN"
            );


            const insertResult =
                await client.query(
                    `
                    INSERT INTO users (
                        full_name,
                        username,
                        password_hash,
                        role_id,
                        is_active
                    )
                    VALUES (
                        $1,
                        $2,
                        $3,
                        $4,
                        TRUE
                    )
                    RETURNING
                        id,
                        full_name,
                        username,
                        role_id,
                        is_active,
                        created_at,
                        updated_at
                    `,
                    [
                        cleanName,
                        cleanUsername,
                        passwordHash,
                        selectedRole.id,
                    ]
                );


            await client.query(
                "COMMIT"
            );


            const createdUser =
                insertResult.rows[0];


            return res.status(201).json({

                success: true,

                message:
                    `User "${createdUser.username}" has been created successfully.`,

                user: {
                    id:
                        createdUser.id,

                    name:
                        createdUser.full_name,

                    username:
                        createdUser.username,

                    role:
                        selectedRole.role_name,

                    active:
                        createdUser.is_active,
                },

            });

        } catch (error) {

            try {

                await client.query(
                    "ROLLBACK"
                );

            } catch {
                // Ignore rollback errors.
            }


            console.error(
                "Create user error:",
                error
            );


            if (
                typeof error === "object" &&
                error !== null &&
                "code" in error &&
                (error as { code?: string }).code ===
                    "23505"
            ) {

                return res.status(409).json({
                    success: false,
                    message:
                        "This username already exists.",
                });

            }


            return res.status(500).json({
                success: false,
                message:
                    "Failed to create user.",
            });

        } finally {

            client.release();

        }

    }
);


/* =========================================
   DEACTIVATE USER
========================================= */

router.delete(
    "/:id",
    async (req: Request, res: Response) => {

        const client =
            await pool.connect();

        try {

            const userId =
                req.params.id;

            const adminUserId =
                req.body?.adminUserId;


            if (!userId) {

                return res.status(400).json({
                    success: false,
                    message:
                        "User ID is required.",
                });

            }


            if (!adminUserId) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Admin user ID is required.",
                });

            }


            await client.query(
                "BEGIN"
            );


            /* =========================================
               VERIFY ADMIN
            ========================================= */

            const adminResult =
                await client.query(
                    `
                    SELECT
                        u.id,
                        u.username,
                        u.is_active,
                        r.role_name
                    FROM users u
                    INNER JOIN roles r
                        ON r.id = u.role_id
                    WHERE u.id = $1
                    FOR UPDATE
                    `,
                    [adminUserId]
                );


            if (
                adminResult.rows.length === 0
            ) {

                await client.query(
                    "ROLLBACK"
                );

                return res.status(404).json({
                    success: false,
                    message:
                        "Admin user not found.",
                });

            }


            const adminUser =
                adminResult.rows[0];


            if (
                !adminUser.is_active
            ) {

                await client.query(
                    "ROLLBACK"
                );

                return res.status(403).json({
                    success: false,
                    message:
                        "Inactive users cannot perform this action.",
                });

            }


            if (
                adminUser.role_name !==
                "ADMIN"
            ) {

                await client.query(
                    "ROLLBACK"
                );

                return res.status(403).json({
                    success: false,
                    message:
                        "Only an ADMIN can deactivate users.",
                });

            }


            /* =========================================
               PREVENT SELF-DEACTIVATION
            ========================================= */

            if (
                adminUserId ===
                userId
            ) {

                await client.query(
                    "ROLLBACK"
                );

                return res.status(400).json({
                    success: false,
                    message:
                        "You cannot deactivate your own account.",
                });

            }


            /* =========================================
               FIND TARGET USER
            ========================================= */

            const targetResult =
                await client.query(
                    `
                    SELECT
                        u.id,
                        u.full_name,
                        u.username,
                        u.is_active,
                        r.role_name
                    FROM users u
                    INNER JOIN roles r
                        ON r.id = u.role_id
                    WHERE u.id = $1
                    FOR UPDATE
                    `,
                    [userId]
                );


            if (
                targetResult.rows.length === 0
            ) {

                await client.query(
                    "ROLLBACK"
                );

                return res.status(404).json({
                    success: false,
                    message:
                        "User not found.",
                });

            }


            const targetUser =
                targetResult.rows[0];


            if (
                !targetUser.is_active
            ) {

                await client.query(
                    "ROLLBACK"
                );

                return res.status(400).json({
                    success: false,
                    message:
                        "User is already inactive.",
                });

            }


            /* =========================================
               DEACTIVATE
            ========================================= */

            const updateResult =
                await client.query(
                    `
                    UPDATE users
                    SET
                        is_active = FALSE,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $1
                    RETURNING
                        id,
                        full_name,
                        username,
                        role_id,
                        is_active,
                        updated_at
                    `,
                    [userId]
                );


            await client.query(
                "COMMIT"
            );


            return res.json({

                success: true,

                message:
                    `User "${targetUser.username}" has been deactivated successfully.`,

                user:
                    updateResult.rows[0],

            });

        } catch (error) {

            try {

                await client.query(
                    "ROLLBACK"
                );

            } catch {
                // Ignore rollback errors.
            }


            console.error(
                "Deactivate user error:",
                error
            );


            return res.status(500).json({
                success: false,
                message:
                    "Failed to deactivate user.",
            });

        } finally {

            client.release();

        }

    }
);


/* =========================================
   PERMANENTLY REMOVE INACTIVE USER
========================================= */

router.delete(
    "/:id/permanent",
    async (req: Request, res: Response) => {

        const client =
            await pool.connect();

        try {

            const userId =
                req.params.id;

            const adminUserId =
                req.body?.adminUserId;


            /* =========================================
               BASIC VALIDATION
            ========================================= */

            if (!userId) {

                return res.status(400).json({
                    success: false,
                    message:
                        "User ID is required.",
                });

            }


            if (!adminUserId) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Admin user ID is required.",
                });

            }


            await client.query(
                "BEGIN"
            );


            /* =========================================
               VERIFY ADMIN
            ========================================= */

            const adminResult =
                await client.query(
                    `
                    SELECT
                        u.id,
                        u.username,
                        u.is_active,
                        r.role_name
                    FROM users u
                    INNER JOIN roles r
                        ON r.id = u.role_id
                    WHERE u.id = $1
                    FOR UPDATE
                    `,
                    [adminUserId]
                );


            if (
                adminResult.rows.length === 0
            ) {

                await client.query(
                    "ROLLBACK"
                );

                return res.status(404).json({
                    success: false,
                    message:
                        "Admin user not found.",
                });

            }


            const adminUser =
                adminResult.rows[0];


            if (
                !adminUser.is_active
            ) {

                await client.query(
                    "ROLLBACK"
                );

                return res.status(403).json({
                    success: false,
                    message:
                        "Inactive users cannot perform this action.",
                });

            }


            if (
                adminUser.role_name !==
                "ADMIN"
            ) {

                await client.query(
                    "ROLLBACK"
                );

                return res.status(403).json({
                    success: false,
                    message:
                        "Only an ADMIN can permanently remove users.",
                });

            }


            /* =========================================
               PREVENT SELF-REMOVAL
            ========================================= */

            if (
                adminUserId ===
                userId
            ) {

                await client.query(
                    "ROLLBACK"
                );

                return res.status(400).json({
                    success: false,
                    message:
                        "You cannot permanently remove your own account.",
                });

            }


            /* =========================================
               FIND TARGET
            ========================================= */

            const targetResult =
                await client.query(
                    `
                    SELECT
                        u.id,
                        u.full_name,
                        u.username,
                        u.is_active,
                        r.role_name
                    FROM users u
                    INNER JOIN roles r
                        ON r.id = u.role_id
                    WHERE u.id = $1
                    FOR UPDATE
                    `,
                    [userId]
                );


            if (
                targetResult.rows.length === 0
            ) {

                await client.query(
                    "ROLLBACK"
                );

                return res.status(404).json({
                    success: false,
                    message:
                        "User not found.",
                });

            }


            const targetUser =
                targetResult.rows[0];


            /* =========================================
               ONLY INACTIVE USERS CAN BE REMOVED
            ========================================= */

            if (
                targetUser.is_active
            ) {

                await client.query(
                    "ROLLBACK"
                );

                return res.status(400).json({
                    success: false,
                    message:
                        "Only inactive users can be permanently removed.",
                });

            }


            /* =========================================
               CHECK USER HISTORY
            ========================================= */

            const historyResult =
                await client.query(
                    `
                    SELECT
                        EXISTS (
                            SELECT 1
                            FROM bookings
                            WHERE created_by = $1
                        ) AS has_bookings,

                        EXISTS (
                            SELECT 1
                            FROM booking_approvals
                            WHERE approver_id = $1
                        ) AS has_approvals,

                        EXISTS (
                            SELECT 1
                            FROM allotments
                            WHERE allotted_by = $1
                        ) AS has_allotments,

                        EXISTS (
                            SELECT 1
                            FROM check_ins
                            WHERE checked_in_by = $1
                        ) AS has_check_ins,

                        EXISTS (
                            SELECT 1
                            FROM check_outs
                            WHERE checked_out_by = $1
                        ) AS has_check_outs
                    `,
                    [userId]
                );


            const history =
                historyResult.rows[0];


            if (
                history.has_bookings ||
                history.has_approvals ||
                history.has_allotments ||
                history.has_check_ins ||
                history.has_check_outs
            ) {

                await client.query(
                    "ROLLBACK"
                );

                return res.status(409).json({

                    success: false,

                    message:
                        `User "${targetUser.username}" cannot be permanently removed because this account has existing system history. The account can remain inactive so that booking, approval and operational history is preserved.`,

                });

            }


            /* =========================================
               PERMANENT DELETE
            ========================================= */

            await client.query(
                `
                DELETE FROM users
                WHERE id = $1
                `,
                [userId]
            );


            await client.query(
                "COMMIT"
            );


            return res.json({

                success: true,

                message:
                    `User "${targetUser.username}" has been permanently removed.`,

                user: {
                    id:
                        targetUser.id,

                    name:
                        targetUser.full_name,

                    username:
                        targetUser.username,

                    role:
                        targetUser.role_name,

                    active:
                        false,
                },

            });

        } catch (error) {

            try {

                await client.query(
                    "ROLLBACK"
                );

            } catch {
                // Ignore rollback errors.
            }


            console.error(
                "Permanent user removal error:",
                error
            );


            return res.status(500).json({
                success: false,
                message:
                    "Failed to permanently remove user.",
            });

        } finally {

            client.release();

        }

    }
);


export default router;