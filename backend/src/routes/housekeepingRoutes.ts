import express, { Request, Response } from "express";
import { pool } from "../config/db.js";

const router = express.Router();


/* =========================================
   GET HOUSEKEEPING TASKS
========================================= */

router.get(
    "/tasks",
    async (_req: Request, res: Response): Promise<void> => {

        try {

            const result = await pool.query(`
                SELECT
                    ht.id AS id,
                    ht.room_id,
                    ht.allotment_id,
                    ht.assigned_to,
                    ht.task_status,
                    ht.assigned_at,
                    ht.completed_at,
                    ht.remarks,
                    ht.assigned_at AS created_at,

                    r.room_number,
                    r.room_status,

                    a.booking_id,
                    a.guest_id,

                    g.guest_name,

                    bd.id AS bed_id,
                    bd.bed_number,
                    bd.bed_status,

                    u.full_name AS assigned_to_name

                FROM housekeeping_tasks AS ht

                INNER JOIN rooms AS r
                    ON r.id = ht.room_id

                LEFT JOIN allotments AS a
                    ON a.id = ht.allotment_id

                LEFT JOIN guests AS g
                    ON g.id = a.guest_id

                LEFT JOIN beds AS bd
                    ON bd.id = a.bed_id

                LEFT JOIN users AS u
                    ON u.id = ht.assigned_to

                ORDER BY
                    CASE
                        WHEN ht.task_status = 'NEEDS CLEANING' THEN 1
                        WHEN ht.task_status = 'CLEANING' THEN 2
                        WHEN ht.task_status = 'CLEARED' THEN 3
                        ELSE 4
                    END,
                    r.room_number ASC,
                    bd.bed_number ASC,
                    ht.assigned_at ASC
            `);


            res.status(200).json({
                tasks: result.rows,
            });

        } catch (error) {

            console.error(
                "Error loading housekeeping tasks:",
                error
            );

            res.status(500).json({
                message:
                    "Failed to load housekeeping tasks.",
            });

        }

    }
);


/* =========================================
   ASSIGN TO HOUSEKEEPING
========================================= */

router.post(
    "/:taskId/assign",
    async (req: Request, res: Response): Promise<void> => {

        const {
            taskId,
        } = req.params;

        const {
            assigned_to,
            remarks,
        } = req.body;


        if (!taskId) {

            res.status(400).json({
                message:
                    "Housekeeping task ID is required.",
            });

            return;

        }


        if (!assigned_to) {

            res.status(400).json({
                message:
                    "assigned_to is required.",
            });

            return;

        }


        const client =
            await pool.connect();


        try {

            await client.query("BEGIN");


            /* =================================
               VERIFY USER
            ================================= */

            const userResult =
                await client.query(
                    `
                    SELECT
                        id,
                        full_name,
                        is_active

                    FROM users

                    WHERE id = $1
                    `,
                    [
                        assigned_to,
                    ]
                );


            if (
                userResult.rows.length === 0
            ) {

                await client.query(
                    "ROLLBACK"
                );

                res.status(400).json({
                    message:
                        "Housekeeping user was not found.",
                });

                return;

            }


            if (
                !userResult.rows[0].is_active
            ) {

                await client.query(
                    "ROLLBACK"
                );

                res.status(403).json({
                    message:
                        "The selected housekeeping user is inactive.",
                });

                return;

            }


            /* =================================
               LOCK TASK
            ================================= */

            const taskResult =
                await client.query(
                    `
                    SELECT
                        id,
                        room_id,
                        allotment_id,
                        task_status

                    FROM housekeeping_tasks

                    WHERE id = $1

                    FOR UPDATE
                    `,
                    [
                        taskId,
                    ]
                );


            if (
                taskResult.rows.length === 0
            ) {

                await client.query(
                    "ROLLBACK"
                );

                res.status(404).json({
                    message:
                        "Housekeeping task not found.",
                });

                return;

            }


            const task =
                taskResult.rows[0];


            /* =================================
               STATUS CHECK
            ================================= */

            if (
                task.task_status !==
                "NEEDS CLEANING"
            ) {

                await client.query(
                    "ROLLBACK"
                );

                res.status(400).json({
                    message:
                        "This housekeeping task has already been assigned or completed.",
                });

                return;

            }


            /* =================================
               TASK → CLEANING
            ================================= */

            const updateResult =
                await client.query(
                    `
                    UPDATE housekeeping_tasks

                    SET
                        assigned_to = $2,
                        task_status = 'CLEANING',
                        assigned_at = CURRENT_TIMESTAMP,
                        remarks = COALESCE($3, remarks)

                    WHERE id = $1

                    RETURNING
                        id,
                        room_id,
                        allotment_id,
                        assigned_to,
                        task_status,
                        assigned_at,
                        completed_at,
                        remarks
                    `,
                    [
                        taskId,
                        assigned_to,
                        remarks || null,
                    ]
                );


            /* =================================
               ROOM → CLEANING
            ================================= */

            await client.query(
                `
                UPDATE rooms

                SET
                    room_status = 'CLEANING',
                    updated_at = CURRENT_TIMESTAMP

                WHERE id = $1
                `,
                [
                    task.room_id,
                ]
            );


            /* =================================
               BED → CLEANING
            ================================= */

            if (
                task.allotment_id
            ) {

                await client.query(
                    `
                    UPDATE beds

                    SET
                        bed_status = 'CLEANING'

                    WHERE id = (
                        SELECT bed_id
                        FROM allotments
                        WHERE id = $1
                    )
                    `,
                    [
                        task.allotment_id,
                    ]
                );

            }


            await client.query("COMMIT");


            res.status(200).json({

                message:
                    "Housekeeping has been assigned. Room is now in cleaning status.",

                task:
                    updateResult.rows[0],

                room_status:
                    "CLEANING",

                bed_status:
                    "CLEANING",

            });

        } catch (error) {

            await client.query(
                "ROLLBACK"
            );

            console.error(
                "Error assigning housekeeping task:",
                error
            );

            res.status(500).json({
                message:
                    "Failed to assign housekeeping task.",
            });

        } finally {

            client.release();

        }

    }
);


/* =========================================
   CLEANING COMPLETED
========================================= */

router.post(
    "/:taskId/complete",
    async (req: Request, res: Response): Promise<void> => {

        const {
            taskId,
        } = req.params;

        const {
            completed_by,
            remarks,
        } = req.body;


        if (!taskId) {

            res.status(400).json({
                message:
                    "Housekeeping task ID is required.",
            });

            return;

        }


        if (!completed_by) {

            res.status(400).json({
                message:
                    "completed_by is required.",
            });

            return;

        }


        const client =
            await pool.connect();


        try {

            await client.query("BEGIN");


            /* =================================
               VERIFY USER
            ================================= */

            const userResult =
                await client.query(
                    `
                    SELECT
                        id,
                        full_name,
                        is_active

                    FROM users

                    WHERE id = $1
                    `,
                    [
                        completed_by,
                    ]
                );


            if (
                userResult.rows.length === 0
            ) {

                await client.query(
                    "ROLLBACK"
                );

                res.status(400).json({
                    message:
                        "Completion user was not found.",
                });

                return;

            }


            if (
                !userResult.rows[0].is_active
            ) {

                await client.query(
                    "ROLLBACK"
                );

                res.status(403).json({
                    message:
                        "The completion user is inactive.",
                });

                return;

            }


            /* =================================
               LOCK TASK
            ================================= */

            const taskResult =
                await client.query(
                    `
                    SELECT
                        id,
                        room_id,
                        allotment_id,
                        task_status

                    FROM housekeeping_tasks

                    WHERE id = $1

                    FOR UPDATE
                    `,
                    [
                        taskId,
                    ]
                );


            if (
                taskResult.rows.length === 0
            ) {

                await client.query(
                    "ROLLBACK"
                );

                res.status(404).json({
                    message:
                        "Housekeeping task not found.",
                });

                return;

            }


            const task =
                taskResult.rows[0];


            /* =================================
               STATUS CHECK
            ================================= */

            if (
                task.task_status !==
                "CLEANING"
            ) {

                await client.query(
                    "ROLLBACK"
                );

                res.status(400).json({
                    message:
                        "This room is not currently in the cleaning stage.",
                });

                return;

            }


            /* =================================
               FIND BED
            ================================= */

            let bedId:
                string | null = null;


            if (
                task.allotment_id
            ) {

                const bedResult =
                    await client.query(
                        `
                        SELECT
                            bed_id

                        FROM allotments

                        WHERE id = $1
                        `,
                        [
                            task.allotment_id,
                        ]
                    );


                if (
                    bedResult.rows.length > 0
                ) {

                    bedId =
                        bedResult.rows[0].bed_id;

                }

            }


            /* =================================
               TASK → CLEARED
            ================================= */

            const updateTaskResult =
                await client.query(
                    `
                    UPDATE housekeeping_tasks

                    SET
                        task_status = 'CLEARED',
                        completed_at = CURRENT_TIMESTAMP,
                        remarks = COALESCE($2, remarks)

                    WHERE id = $1

                    RETURNING
                        id,
                        room_id,
                        allotment_id,
                        assigned_to,
                        task_status,
                        assigned_at,
                        completed_at,
                        remarks
                    `,
                    [
                        taskId,
                        remarks || null,
                    ]
                );


            /* =================================
               BED → AVAILABLE
            ================================= */

            if (bedId) {

                await client.query(
                    `
                    UPDATE beds

                    SET
                        bed_status = 'AVAILABLE'

                    WHERE id = $1
                    `,
                    [
                        bedId,
                    ]
                );

            }


            /* =================================
               ACTIVE ALLOTMENTS
            ================================= */

            const activeAllotmentsResult =
                await client.query(
                    `
                    SELECT
                        COUNT(*)::INTEGER AS active_count

                    FROM allotments

                    WHERE room_id = $1

                      AND allotment_status = 'ALLOTTED'
                    `,
                    [
                        task.room_id,
                    ]
                );


            const activeCount =
                activeAllotmentsResult
                    .rows[0]
                    .active_count;


            /* =================================
               OTHER CLEANING TASKS
            ================================= */

            const pendingCleaningResult =
                await client.query(
                    `
                    SELECT
                        COUNT(*)::INTEGER AS pending_count

                    FROM housekeeping_tasks

                    WHERE room_id = $1

                      AND task_status IN (
                          'NEEDS CLEANING',
                          'CLEANING'
                      )

                      AND id <> $2
                    `,
                    [
                        task.room_id,
                        taskId,
                    ]
                );


            const pendingCleaningCount =
                pendingCleaningResult
                    .rows[0]
                    .pending_count;


            /* =================================
               ROOM STATUS
            ================================= */

            let newRoomStatus:
                string;


            if (
                activeCount > 0
            ) {

                newRoomStatus =
                    "OCCUPIED";

            } else if (
                pendingCleaningCount > 0
            ) {

                newRoomStatus =
                    "CLEANING";

            } else {

                newRoomStatus =
                    "AVAILABLE";

            }


            /* =================================
               UPDATE ROOM
            ================================= */

            await client.query(
                `
                UPDATE rooms

                SET
                    room_status = $2,
                    updated_at = CURRENT_TIMESTAMP

                WHERE id = $1
                `,
                [
                    task.room_id,
                    newRoomStatus,
                ]
            );


            /* =================================
               COMMIT
            ================================= */

            await client.query("COMMIT");


            res.status(200).json({

                message:
                    newRoomStatus === "AVAILABLE"
                        ? "Cleaning completed. Room is now available."
                        : "Cleaning completed for this task.",

                task:
                    updateTaskResult.rows[0],

                room_status:
                    newRoomStatus,

                bed_status:
                    bedId
                        ? "AVAILABLE"
                        : null,

            });

        } catch (error) {

            await client.query(
                "ROLLBACK"
            );

            console.error(
                "Error completing housekeeping task:",
                error
            );

            res.status(500).json({
                message:
                    "Failed to complete housekeeping task.",
            });

        } finally {

            client.release();

        }

    }
);


export default router;