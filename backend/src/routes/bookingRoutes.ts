import { randomUUID } from "node:crypto";
import { Router, type RequestHandler } from "express";
import multer from "multer";
import { pool } from "../config/db.js";
import {
    BookingPricingInputError,
    calculateBookingPricing,
    isGuestType,
    roomRateColumnForGuestType,
    resolveDormitoryGuestType,
    type AccommodationCategory,
    type GuestType,
} from "../services/bookingPricing.js";
import { resolveResumableBookingStep } from "../services/bookingWorkflowProgress.js";
import {
    decryptBookingDocument,
    encryptBookingDocument,
    getDocumentEncryptionKey,
} from "../services/bookingDocuments.js";

const router = Router();
const bookingDocumentUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024,
        files: 11,
        fields: 1,
        parts: 12,
    },
});

const parseBookingFiles: RequestHandler = (req, res, next) => {
    bookingDocumentUpload.any()(req, res, (error: unknown) => {
        if (error instanceof multer.MulterError) {
            return res.status(
                error.code === "LIMIT_FILE_SIZE" ? 413 : 400
            ).json({
                success: false,
                message:
                    error.code === "LIMIT_FILE_SIZE"
                        ? "Each uploaded document must be 5 MB or smaller."
                        : "The uploaded document request exceeds the allowed limits.",
            });
        }
        if (error) {
            return next(error);
        }
        return next();
    });
};

const isSupportedDocument = (
    file: Express.Multer.File
): boolean => {
    if (file.mimetype === "application/pdf") {
        return file.buffer.subarray(0, 5).toString("ascii") === "%PDF-";
    }
    if (file.mimetype === "image/jpeg") {
        return file.buffer[0] === 0xff &&
            file.buffer[1] === 0xd8 &&
            file.buffer[2] === 0xff;
    }
    if (file.mimetype === "image/png") {
        return file.buffer.subarray(0, 8).equals(
            Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
        );
    }
    return false;
};

const resumableSteps = new Set([
    "AVAILABILITY",
    "GUEST_TYPE",
    "RATE",
    "BOOKING_CONFIRMATION",
]);

router.post("/", parseBookingFiles, async (req, res) => {
    const client = await pool.connect();

    try {
        let requestBody: Record<string, any> = req.body;
        const uploadedFiles = Array.isArray(req.files)
            ? req.files as Express.Multer.File[]
            : [];
        if (
            typeof req.headers["content-type"] === "string" &&
            req.headers["content-type"].startsWith("multipart/form-data")
        ) {
            if (typeof req.body.booking_payload !== "string") {
                return res.status(400).json({
                    success: false,
                    message: "Multipart booking data is missing.",
                });
            }
            try {
                requestBody = JSON.parse(req.body.booking_payload);
                if (
                    !requestBody ||
                    typeof requestBody !== "object" ||
                    Array.isArray(requestBody)
                ) {
                    return res.status(400).json({
                        success: false,
                        message: "Multipart booking data must be a JSON object.",
                    });
                }
            } catch {
                return res.status(400).json({
                    success: false,
                    message: "Multipart booking data is invalid JSON.",
                });
            }
        }
        if (req.authUser?.id) {
            requestBody.created_by = req.authUser.id;
        }
        const {
            booking_type,
            check_in_date,
            expected_check_out_date,
            number_of_guests,
            purpose_of_visit,
            special_requirements,
            is_emergency,
            created_by,
            service_member,
            guests,
        } = requestBody;

        /* =========================================
           BASIC BOOKING VALIDATION
        ========================================= */

        if (
            !booking_type ||
            !check_in_date ||
            !expected_check_out_date ||
            !created_by
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Booking type, check-in date, check-out date and created_by are required",
            });
        }

        if (
            !["CURRENT", "ADVANCE"].includes(
                booking_type
            )
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Booking type must be CURRENT or ADVANCE",
            });
        }

        const guestCount =
            Number(number_of_guests || 1);

        if (
            !Number.isInteger(guestCount) ||
            guestCount <= 0
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Number of guests must be a positive integer",
            });
        }

        /* =========================================
           GUEST VALIDATION
        ========================================= */

        if (
            !Array.isArray(guests) ||
            guests.length !== guestCount
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Guest details must be provided for every guest",
            });
        }

        if (
            guests.filter(
                (guest: { relationship?: string }) =>
                    String(guest?.relationship ?? "").trim().toUpperCase() === "SELF"
            ).length > 1
        ) {
            return res.status(400).json({
                success: false,
                message: "Only one occupant can be marked as SELF for a booking person.",
            });
        }

        const requiredServiceMemberFields = [
            "service_number",
            "rank",
            "full_name",
            "mobile_number",
            "address",
        ] as const;

        if (
            !service_member ||
            requiredServiceMemberFields.some(
                (field) =>
                    typeof service_member[field] !== "string" ||
                    !service_member[field].trim()
            )
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Serviceman number, rank, name, mobile number and address are required.",
            });
        }

        if (!/^\d{12}$/.test(String(service_member.aadhaar_number ?? ""))) {
            return res.status(400).json({
                success: false,
                message: "Booking person's Aadhaar number must contain exactly 12 digits.",
            });
        }

        if (!/^\d{10}$/.test(String(service_member.mobile_number ?? ""))) {
            return res.status(400).json({
                success: false,
                message: "Booking person's mobile number must contain exactly 10 digits.",
            });
        }

        for (
            let index = 0;
            index < guests.length;
            index++
        ) {

            const guest =
                guests[index];

            if (
                !guest ||
                !guest.name ||
                !String(
                    guest.name
                ).trim()
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        `Guest ${index + 1}: name is required`,
                });
            }

            if (!["MALE", "FEMALE", "CHILD", "GUEST"].includes(
                String(guest.gender ?? "").trim().toUpperCase()
            )) {
                return res.status(400).json({
                    success: false,
                    message: `Guest ${index + 1}: select Male, Female, Child, or Guest.`,
                });
            }

            if (
                ["CHILD", "GUEST"].includes(String(guest.gender).trim().toUpperCase()) &&
                !["MALE", "FEMALE"].includes(String(guest.actualGender ?? "").trim().toUpperCase())
            ) {
                return res.status(400).json({
                    success: false,
                    message: `Guest ${index + 1}: actual gender is required for room eligibility.`,
                });
            }

            if (
                !["SELF", "WIFE", "SON", "DAUGHTER", "MOTHER", "FATHER", "OTHER"].includes(
                    String(guest.relationship ?? "").trim().toUpperCase()
                )
            ) {
                return res.status(400).json({
                    success: false,
                    message: `Guest ${index + 1}: a valid relationship is required.`,
                });
            }

            if (!/^\d{10}$/.test(String(guest.mobile ?? ""))) {
                return res.status(400).json({
                    success: false,
                    message: `Guest ${index + 1}: mobile number must contain exactly 10 digits.`,
                });
            }

            if (!/^\d{12}$/.test(String(guest.aadhaar ?? ""))) {
                return res.status(400).json({
                    success: false,
                    message: `Guest ${index + 1}: Aadhaar number must contain exactly 12 digits.`,
                });
            }

            if (String(guest.relationship).trim().toUpperCase() !== "SELF") {
                const allowedRelationshipProofTypes = [
                    "DEPARTMENT CARD",
                    "AADHAAR CARD",
                    "PAN CARD",
                    "DEPENDENT CARD",
                    "WIDOW CARD",
                    "CANTEEN CARD",
                    "ECHS CARD",
                ];
                const relationshipProofType = String(
                    guest.relationshipProofType ?? ""
                ).trim().toUpperCase();

                if (
                    !allowedRelationshipProofTypes.includes(relationshipProofType) ||
                    typeof guest.relationshipProofNumber !== "string" ||
                    !guest.relationshipProofNumber.trim()
                ) {
                    return res.status(400).json({
                        success: false,
                        message: `Guest ${index + 1}: select a valid relationship proof type and enter its number.`,
                    });
                }
            }

        }

        const seenDocumentFields = new Set<string>();
        for (const file of uploadedFiles) {
            const guestDocumentMatch =
                /^occupant_document_(\d+)$/.exec(file.fieldname);
            const isBookingPersonDocument =
                file.fieldname === "booking_person_document";
            if (
                !isBookingPersonDocument &&
                (!guestDocumentMatch ||
                    Number(guestDocumentMatch[1]) >= guestCount)
            ) {
                return res.status(400).json({
                    success: false,
                    message: "An uploaded document is not associated with a valid booking person or occupant.",
                });
            }
            if (seenDocumentFields.has(file.fieldname)) {
                return res.status(400).json({
                    success: false,
                    message: "Only one document may be uploaded for each person.",
                });
            }
            if (!isSupportedDocument(file)) {
                return res.status(400).json({
                    success: false,
                    message: "Documents must be valid PDF, JPEG, or PNG files.",
                });
            }
            seenDocumentFields.add(file.fieldname);
        }

        const requiredDocumentFields = [
            "booking_person_document",
            ...guests.map((_: unknown, index: number) =>
                `occupant_document_${index}`
            ),
        ];
        const missingDocument = requiredDocumentFields.find(
            (field) => !seenDocumentFields.has(field)
        );
        if (missingDocument) {
            return res.status(400).json({
                success: false,
                message:
                    missingDocument === "booking_person_document"
                        ? "A document for the booking person is required."
                        : "A document is required for every occupant.",
            });
        }

        let documentKey: Buffer;
        try {
            documentKey = getDocumentEncryptionKey();
        } catch (error) {
            return res.status(503).json({
                success: false,
                message:
                    error instanceof Error
                        ? error.message
                        : "Secure document storage is not configured.",
            });
        }

        /* =========================================
           DATE VALIDATION

           CURRENT:
           - Check-in must be TODAY.
           - Check-out may be the same date as check-in.

           ADVANCE:
           - Check-in must be AFTER TODAY.
           - Check-out may be the same date as check-in.

           Dates are handled as YYYY-MM-DD strings
           to avoid browser/server timezone problems.
        ========================================= */

        const normalizeDate =
            (value: unknown): string | null => {

                if (
                    typeof value !== "string"
                ) {
                    return null;
                }

                const trimmed =
                    value.trim();

                if (
                    !/^\d{4}-\d{2}-\d{2}$/.test(
                        trimmed
                    )
                ) {
                    return null;
                }

                return trimmed;
            };


        const checkInDate =
            normalizeDate(
                check_in_date
            );

        const checkOutDate =
            normalizeDate(
                expected_check_out_date
            );


        /* =========================================
           VALIDATE DATE FORMAT
        ========================================= */

        if (
            !checkInDate ||
            !checkOutDate
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "Check-in and check-out dates must be in YYYY-MM-DD format",
            });

        }


        /* =========================================
           GET DATABASE CURRENT DATE

           PostgreSQL CURRENT_DATE is used so the
           booking rule follows the database date.
        ========================================= */

        const todayResult =
            await client.query(
                `
                SELECT
                    CURRENT_DATE::TEXT AS today
                `
            );


        const today =
            todayResult.rows[0].today;


        /* =========================================
           CHECK-OUT CANNOT BE BEFORE CHECK-IN
        ========================================= */

        if (
            checkOutDate <
            checkInDate
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "Expected check-out date cannot be before check-in date",
            });

        }


        /* =========================================
           CURRENT BOOKING RULE

           CURRENT means the stay starts TODAY.
        ========================================= */

        if (
            booking_type === "CURRENT" &&
            checkInDate !== today
        ) {

            return res.status(400).json({
                success: false,
                message:
                    `CURRENT booking must have today's check-in date (${today}).`,
            });

        }


        /* =========================================
           ADVANCE BOOKING RULE

           ADVANCE means the stay starts AFTER
           TODAY.
        ========================================= */

        if (
            booking_type === "ADVANCE" &&
            checkInDate <= today
        ) {

            return res.status(400).json({
                success: false,
                message:
                    `ADVANCE booking must have a future check-in date after today (${today}).`,
            });

        }


        /* =========================================
           VERIFY CREATING USER
        ========================================= */

        const userResult =
            await client.query(
                `
                SELECT
                    id,
                    is_active
                FROM users
                WHERE id = $1
                `,
                [created_by]
            );

        if (
            userResult.rows.length === 0
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Creating user does not exist",
            });
        }

        if (
            !userResult.rows[0].is_active
        ) {
            return res.status(403).json({
                success: false,
                message:
                    "Creating user is inactive",
            });
        }

        /* =========================================
           START TRANSACTION
        ========================================= */

        await client.query(
            "BEGIN"
        );

        /* =========================================
           GENERATE BOOKING REFERENCE
        ========================================= */

        const referenceResult =
            await client.query(`
                SELECT
                    COALESCE(
                        MAX(
                            CAST(
                                SUBSTRING(
                                    booking_reference
                                    FROM '[0-9]+$'
                                ) AS INTEGER
                            )
                        ),
                        0
                    ) + 1 AS next_number
                FROM bookings
                WHERE booking_reference LIKE
                    'ESM-' ||
                    EXTRACT(
                        YEAR FROM CURRENT_DATE
                    )::TEXT ||
                    '-%';
            `);

        const nextNumber =
            Number(
                referenceResult.rows[0]
                    .next_number
            );

        const year =
            new Date().getFullYear();

        const bookingReference =
            `ESM-${year}-${String(
                nextNumber
            ).padStart(5, "0")}`;

        /* =========================================
           CREATE BOOKING
        ========================================= */

        const bookingResult =
            await client.query(
                `
                INSERT INTO bookings (
                    booking_reference,
                    booking_type,
                    booking_date,
                    check_in_date,
                    expected_check_out_date,
                    number_of_guests,
                    booking_status,
                    approval_status,
                    purpose_of_visit,
                    special_requirements,
                    is_emergency,
                    created_by
                )
                VALUES (
                    $1,
                    $2,
                    CURRENT_DATE,
                    $3,
                    $4,
                    $5,
                    'PENDING_APPROVAL',
                    'PENDING',
                    $6,
                    $7,
                    $8,
                    $9
                )
                RETURNING
                    id,
                    booking_reference,
                    booking_type,
                    booking_date,
                    check_in_date,
                    expected_check_out_date,
                    number_of_guests,
                    booking_status,
                    approval_status,
                    purpose_of_visit,
                    special_requirements,
                    is_emergency,
                    created_by,
                    created_at;
                `,
                [
                    bookingReference,
                    booking_type,
                    checkInDate,
                    checkOutDate,
                    guestCount,
                    purpose_of_visit ||
                        null,
                    special_requirements ||
                        null,
                    Boolean(
                        is_emergency
                    ),
                    created_by,
                ]
            );

        const booking =
            bookingResult.rows[0];

        await client.query(
            `
            INSERT INTO booking_workflow_progress (
                booking_id,
                current_step,
                updated_by
            )
            VALUES ($1, 'AVAILABILITY', $2)
            `,
            [booking.id, req.authUser?.id ?? created_by]
        );

        await client.query(
                `
                INSERT INTO booking_service_members (
                    booking_id,
                    service_number,
                    rank,
                    full_name,
                    mobile_number,
                    address,
                    identity_number,
                    aadhaar_number
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                `,
                [
                    booking.id,
                    service_member.service_number.trim(),
                    service_member.rank.trim(),
                    service_member.full_name.trim(),
                    service_member.mobile_number,
                    service_member.address.trim(),
                    null,
                    service_member.aadhaar_number,
                ]
            );

        /* =========================================
           CREATE GUESTS + BOOKING_GUESTS
        ========================================= */

        const savedGuests = [];

        for (
            let index = 0;
            index < guests.length;
            index++
        ) {

            const guest =
                guests[index];

            /* =============================
               INSERT GUEST
            ============================== */

            const guestResult =
                await client.query(
                    `
                    INSERT INTO guests (
                        guest_name,
                        gender,
                        guest_category,
                        date_of_birth,
                        mobile_number,
                        email,
                        address,
                        identity_type,
                        identity_number,
                        designation,
                        department,
                        organization,
                        emergency_contact_name,
                        emergency_contact_number,
                        rank,
                        relationship,
                        identity_proof_type,
                        identity_proof_number,
                        relationship_proof_type,
                        relationship_proof_number,
                        aadhaar_number
                    )
                    VALUES (
                        $1,
                        $2,
                        $3,
                        $4,
                        $5,
                        $6,
                        $7,
                        $8,
                        $9,
                        $10,
                        $11,
                        $12,
                        $13,
                        $14,
                        $15,
                        $16,
                        $17,
                        $18,
                        $19,
                        $20,
                        $21
                    )
                    RETURNING id;
                    `,
                    [
                        guest.name ||
                            null,

                        ["CHILD", "GUEST"].includes(String(guest.gender ?? "").toUpperCase())
                            ? String(guest.actualGender).toUpperCase()
                            : String(guest.gender).toUpperCase(),

                        String(guest.gender).toUpperCase(),

                        guest.dateOfBirth ||
                            null,

                        guest.mobile ||
                            null,

                        guest.email ||
                            null,

                        guest.address ||
                            null,

                        guest.identityProof ||
                            null,

                        guest.identityNo ||
                            null,

                        guest.designation ||
                            null,

                        guest.department ||
                            null,

                        guest.organization ||
                            null,

                        guest.emergencyContactName ||
                            null,

                        guest.emergencyContactNumber ||
                            null,

                        guest.rank ||
                            null,

                        guest.relationship ||
                            null,

                        null,

                        null,

                        guest.relationshipProofType ||
                            null,

                        guest.relationshipProofNumber ||
                            null,

                        guest.aadhaar,
                    ]
                );

            const savedGuest =
                guestResult.rows[0];

            /* =============================
               LINK GUEST TO BOOKING
            ============================== */

            await client.query(
                `
                INSERT INTO booking_guests (
                    booking_id,
                    guest_id,
                    is_primary_guest
                )
                VALUES (
                    $1,
                    $2,
                    $3
                );
                `,
                [
                    booking.id,
                    savedGuest.id,
                    index === 0,
                ]
            );

            savedGuests.push(
                savedGuest
            );

        }

        if (documentKey) {
            for (const file of uploadedFiles) {
                const guestDocumentMatch =
                    /^occupant_document_(\d+)$/.exec(file.fieldname);
                const guestIndex = guestDocumentMatch
                    ? Number(guestDocumentMatch[1])
                    : -1;
                const encrypted = encryptBookingDocument(
                    file.buffer,
                    documentKey
                );
                await client.query(
                    `
                    INSERT INTO booking_documents (
                        id,
                        booking_id,
                        guest_id,
                        person_type,
                        content_type,
                        encrypted_content,
                        iv,
                        auth_tag,
                        uploaded_by
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                    `,
                    [
                        randomUUID(),
                        booking.id,
                        guestIndex < 0
                            ? null
                            : savedGuests[guestIndex].id,
                        guestIndex < 0
                            ? "BOOKING_PERSON"
                            : "OCCUPANT",
                        file.mimetype,
                        encrypted.encryptedContent,
                        encrypted.iv,
                        encrypted.authTag,
                        req.authUser?.id ?? created_by,
                    ]
                );
            }
        }

        /* =========================================
           COMMIT
        ========================================= */

        await client.query(
            "COMMIT"
        );

        return res.status(201).json({
            success: true,

            message:
                "Booking and guest details saved successfully",

            booking,

            guests:
                savedGuests,
        });

    } catch (error) {

        await client.query(
            "ROLLBACK"
        );

        console.error(
            "Booking creation error:",
            error
        );

        const postgresErrorCode =
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            typeof error.code === "string"
                ? error.code
                : null;
        if (
            postgresErrorCode === "42P01" ||
            postgresErrorCode === "42703"
        ) {
            return res.status(503).json({
                success: false,
                message:
                    "The database is missing required booking or document updates. Ask the administrator to apply the related SQL migrations, then try again.",
            });
        }

        return res.status(500).json({
            success: false,
            message:
                "Unable to create booking",
        });

    } finally {

        client.release();

    }
});

router.put("/:bookingId", parseBookingFiles, async (req, res) => {
    const userId = req.authUser?.id;
    if (!userId) {
        return res.status(401).json({
            success: false,
            message: "Authentication is required.",
        });
    }

    let requestBody: Record<string, any> = req.body;
    const uploadedFiles = Array.isArray(req.files)
        ? req.files as Express.Multer.File[]
        : [];
    if (
        typeof req.headers["content-type"] === "string" &&
        req.headers["content-type"].startsWith("multipart/form-data")
    ) {
        if (typeof req.body.booking_payload !== "string") {
            return res.status(400).json({
                success: false,
                message: "Multipart booking data is missing.",
            });
        }
        try {
            requestBody = JSON.parse(req.body.booking_payload);
        } catch {
            return res.status(400).json({
                success: false,
                message: "Multipart booking data is invalid JSON.",
            });
        }
    }
    if (
        !requestBody ||
        typeof requestBody !== "object" ||
        Array.isArray(requestBody)
    ) {
        return res.status(400).json({
            success: false,
            message: "Booking data must be a JSON object.",
        });
    }

    const {
        booking_type,
        check_in_date: checkInDate,
        expected_check_out_date: checkOutDate,
        number_of_guests: guestCountValue,
        service_member: serviceMember,
        guests,
    } = requestBody;
    const guestCount = Number(guestCountValue);

    if (
        !["CURRENT", "ADVANCE"].includes(booking_type) ||
        typeof checkInDate !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(checkInDate) ||
        typeof checkOutDate !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(checkOutDate) ||
        checkOutDate < checkInDate ||
        !Number.isInteger(guestCount) ||
        guestCount < 1 ||
        guestCount > 10 ||
        !Array.isArray(guests) ||
        guests.length !== guestCount ||
        !serviceMember ||
        typeof serviceMember !== "object"
    ) {
        return res.status(400).json({
            success: false,
            message: "The booking details are incomplete or invalid.",
        });
    }

    if (
        ["service_number", "rank", "full_name", "mobile_number", "address"]
            .some((field) =>
                typeof serviceMember[field] !== "string" ||
                !serviceMember[field].trim()
            ) ||
        !/^\d{10}$/.test(String(serviceMember.mobile_number))
    ) {
        return res.status(400).json({
            success: false,
            message: "Complete the booking person's required details before continuing.",
        });
    }

    const guestIds = guests
        .map((guest: Record<string, unknown>) =>
            typeof guest?.id === "string" && guest.id ? guest.id : null
        )
        .filter((id: string | null): id is string => id !== null);
    if (new Set(guestIds).size !== guestIds.length) {
        return res.status(400).json({
            success: false,
            message: "A guest cannot be included more than once.",
        });
    }

    for (let index = 0; index < guests.length; index++) {
        const guest = guests[index];
        if (
            !guest ||
            typeof guest.name !== "string" ||
            !guest.name.trim() ||
            !["MALE", "FEMALE", "CHILD", "GUEST"].includes(String(guest.gender).toUpperCase()) ||
            (["CHILD", "GUEST"].includes(String(guest.gender).toUpperCase()) &&
                !["MALE", "FEMALE"].includes(String(guest.actualGender ?? "").toUpperCase())) ||
            !["SELF", "WIFE", "SON", "DAUGHTER", "MOTHER", "FATHER", "OTHER"]
                .includes(String(guest.relationship).toUpperCase()) ||
            !/^\d{10}$/.test(String(guest.mobile ?? "")) ||
            (guest.aadhaar && !/^\d{12}$/.test(String(guest.aadhaar))) ||
            (!guest.id && !/^\d{12}$/.test(String(guest.aadhaar ?? "")))
        ) {
            return res.status(400).json({
                success: false,
                message: `Guest ${index + 1}: required information is invalid.`,
            });
        }

        if (
            String(guest.relationship).toUpperCase() !== "SELF" &&
            (
                typeof guest.relationshipProofType !== "string" ||
                !guest.relationshipProofType.trim() ||
                typeof guest.relationshipProofNumber !== "string" ||
                !guest.relationshipProofNumber.trim()
            )
        ) {
            return res.status(400).json({
                success: false,
                message: `Guest ${index + 1}: relationship proof details are required.`,
            });
        }
    }

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        const bookingResult = await client.query(
            `
            SELECT
                id,
                booking_reference,
                booking_type,
                check_in_date::TEXT AS check_in_date,
                expected_check_out_date::TEXT AS check_out_date,
                number_of_guests,
                created_by,
                booking_status,
                approval_status
            FROM bookings
            WHERE id = $1
            FOR UPDATE
            `,
            [req.params.bookingId]
        );
        if (bookingResult.rowCount === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({
                success: false,
                message: "Booking was not found.",
            });
        }

        const booking = bookingResult.rows[0];
        if (
            booking.created_by !== userId &&
            req.authUser?.role !== "ADMIN"
        ) {
            await client.query("ROLLBACK");
            return res.status(403).json({
                success: false,
                message: "Only the booking creator or an ADMIN can update this booking.",
            });
        }
        if (
            booking.booking_status !== "PENDING_APPROVAL" ||
            !["PENDING", "APPROVED"].includes(booking.approval_status)
        ) {
            await client.query("ROLLBACK");
            return res.status(409).json({
                success: false,
                message: "Booking details cannot be changed at this workflow stage.",
            });
        }

        const todayResult = await client.query(
            "SELECT CURRENT_DATE::TEXT AS today"
        );
        const today = todayResult.rows[0].today;
        if (
            (booking_type === "CURRENT" && checkInDate !== today) ||
            (booking_type === "ADVANCE" && checkInDate <= today)
        ) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                success: false,
                message: booking_type === "CURRENT"
                    ? `CURRENT booking must have today's check-in date (${today}).`
                    : `ADVANCE booking must have a future check-in date after today (${today}).`,
            });
        }

        const operationalRecords = await client.query(
            `
            SELECT EXISTS (
                SELECT 1 FROM payments WHERE booking_id = $1
            ) OR EXISTS (
                SELECT 1 FROM allotments WHERE booking_id = $1
            ) AS has_operational_records
            `,
            [booking.id]
        );
        if (operationalRecords.rows[0].has_operational_records) {
            await client.query("ROLLBACK");
            return res.status(409).json({
                success: false,
                message: "This booking already has payment or allotment records and cannot be edited.",
            });
        }

        const existingGuestResult = await client.query(
            `
            SELECT bg.guest_id, g.relationship, g.gender, g.guest_category
            FROM booking_guests bg
            INNER JOIN guests g ON g.id = bg.guest_id
            WHERE bg.booking_id = $1
            `,
            [booking.id]
        );
        const existingGuestIds = new Set<string>(
            existingGuestResult.rows.map((row) => String(row.guest_id))
        );
        const existingRelationships = new Map<string, string>(
            existingGuestResult.rows.map((row) => [
                String(row.guest_id),
                String(row.relationship ?? "").toUpperCase(),
            ])
        );
        const existingGenders = new Map<string, string>(
            existingGuestResult.rows.map((row) => [
                String(row.guest_id),
                String(row.gender ?? "").toUpperCase(),
            ])
        );
        const existingGuestCategories = new Map<string, string>(
            existingGuestResult.rows.map((row) => [
                String(row.guest_id),
                String(row.guest_category ?? row.gender ?? "").toUpperCase(),
            ])
        );
        if (guestIds.some((id: string) => !existingGuestIds.has(id))) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                success: false,
                message: "A guest ID does not belong to this booking.",
            });
        }

        const retainedGuestIds: string[] = [];
        const savedGuests: Array<{ id: string }> = [];
        for (let index = 0; index < guests.length; index++) {
            const guest = guests[index];
            if (typeof guest.id === "string" && guest.id) {
                await client.query(
                    `
                    UPDATE guests
                    SET
                        guest_name = $2,
                        gender = $3,
                        guest_category = $4,
                        relationship = $5,
                        mobile_number = $6,
                        address = $7,
                        relationship_proof_type = $8,
                        relationship_proof_number = $9,
                        aadhaar_number = COALESCE(NULLIF($10, ''), aadhaar_number)
                    WHERE id = $1
                    `,
                    [
                        guest.id,
                        guest.name.trim(),
                        ["CHILD", "GUEST"].includes(String(guest.gender).toUpperCase())
                            ? String(guest.actualGender).toUpperCase()
                            : String(guest.gender).toUpperCase(),
                        String(guest.gender).toUpperCase(),
                        String(guest.relationship).toUpperCase(),
                        guest.mobile,
                        guest.address || null,
                        guest.relationshipProofType || null,
                        guest.relationshipProofNumber || null,
                        guest.aadhaar || "",
                    ]
                );
                retainedGuestIds.push(guest.id);
                savedGuests.push({ id: guest.id });
            } else {
                const guestResult = await client.query(
                    `
                    INSERT INTO guests (
                        guest_name,
                        gender,
                        guest_category,
                        mobile_number,
                        address,
                        relationship,
                        relationship_proof_type,
                        relationship_proof_number,
                        aadhaar_number
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                    RETURNING id
                    `,
                    [
                        guest.name.trim(),
                        ["CHILD", "GUEST"].includes(String(guest.gender).toUpperCase())
                            ? String(guest.actualGender).toUpperCase()
                            : String(guest.gender).toUpperCase(),
                        String(guest.gender).toUpperCase(),
                        guest.mobile,
                        guest.address || null,
                        String(guest.relationship).toUpperCase(),
                        guest.relationshipProofType || null,
                        guest.relationshipProofNumber || null,
                        guest.aadhaar || null,
                    ]
                );
                retainedGuestIds.push(guestResult.rows[0].id);
                savedGuests.push({ id: guestResult.rows[0].id });
                await client.query(
                    `
                    INSERT INTO booking_guests (
                        booking_id,
                        guest_id,
                        is_primary_guest
                    )
                    VALUES ($1, $2, $3)
                    `,
                    [booking.id, guestResult.rows[0].id, index === 0]
                );
            }
        }

        for (let index = 0; index < savedGuests.length; index++) {
            await client.query(
                `
                UPDATE booking_guests
                SET is_primary_guest = $3
                WHERE booking_id = $1 AND guest_id = $2
                `,
                [booking.id, savedGuests[index].id, index === 0]
            );
        }

        const removedGuestIds = [...existingGuestIds].filter(
            (id) => !retainedGuestIds.includes(id)
        );
        const bookingTermsChanged =
            booking.booking_type !== booking_type ||
            booking.check_in_date !== checkInDate ||
            booking.check_out_date !== checkOutDate ||
            Number(booking.number_of_guests) !== guestCount ||
            removedGuestIds.length > 0 ||
            guests.some(
                (guest: Record<string, unknown>) =>
                    !guest.id ||
                    (
                        typeof guest.id === "string" &&
                        (
                            existingRelationships.get(guest.id) !==
                                String(guest.relationship ?? "").toUpperCase() ||
                            existingGenders.get(guest.id) !==
                                (
                                    ["CHILD", "GUEST"].includes(
                                        String(guest.gender ?? "").toUpperCase()
                                    )
                                        ? String(guest.actualGender ?? "").toUpperCase()
                                        : String(guest.gender ?? "").toUpperCase()
                                ) ||
                            existingGuestCategories.get(guest.id) !==
                                String(guest.gender ?? "").toUpperCase()
                        )
                    )
            );
        const approvalMustReset =
            booking.approval_status === "APPROVED" &&
            bookingTermsChanged;

        if (removedGuestIds.length > 0) {
            await client.query(
                "DELETE FROM booking_acceptances WHERE booking_id = $1 AND guest_id = ANY($2::UUID[])",
                [booking.id, removedGuestIds]
            );
            await client.query(
                "DELETE FROM booking_documents WHERE booking_id = $1 AND guest_id = ANY($2::UUID[])",
                [booking.id, removedGuestIds]
            );
            await client.query(
                "DELETE FROM booking_guests WHERE booking_id = $1 AND guest_id = ANY($2::UUID[])",
                [booking.id, removedGuestIds]
            );
        }

        await client.query(
            `
            UPDATE bookings
            SET
                booking_type = $2,
                check_in_date = $3,
                expected_check_out_date = $4,
                number_of_guests = $5,
                acceptance_status = CASE
                    WHEN $6 THEN 'PENDING'
                    ELSE acceptance_status
                END,
                approval_status = CASE
                    WHEN $7 THEN 'PENDING'
                    ELSE approval_status
                END,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
            `,
            [
                booking.id,
                booking_type,
                checkInDate,
                checkOutDate,
                guestCount,
                bookingTermsChanged,
                approvalMustReset,
            ]
        );
        await client.query(
            `
            UPDATE booking_service_members
            SET
                service_number = $2,
                rank = $3,
                full_name = $4,
                mobile_number = $5,
                address = $6,
                aadhaar_number = COALESCE(NULLIF($7, ''), aadhaar_number)
            WHERE booking_id = $1
            `,
            [
                booking.id,
                serviceMember.service_number.trim(),
                serviceMember.rank.trim(),
                serviceMember.full_name.trim(),
                serviceMember.mobile_number,
                serviceMember.address.trim(),
                serviceMember.aadhaar_number || "",
            ]
        );

        if (bookingTermsChanged) {
            await client.query(
                "DELETE FROM booking_pricing WHERE booking_id = $1",
                [booking.id]
            );
        }
        if (approvalMustReset) {
            await client.query(
                `
                UPDATE booking_approvals
                SET
                    approval_status = 'PENDING',
                    approved_at = NULL,
                    remarks = CONCAT(
                        COALESCE(remarks, ''),
                        CASE
                            WHEN COALESCE(remarks, '') = '' THEN ''
                            ELSE ' | '
                        END,
                        'Re-approval required after booking changes.'
                    )
                WHERE booking_id = $1
                  AND approval_status = 'APPROVED'
                `,
                [booking.id]
            );
        }

        if (uploadedFiles.length > 0) {
            const documentKey = getDocumentEncryptionKey();
            const seenDocumentFields = new Set<string>();
            for (const file of uploadedFiles) {
                const guestMatch =
                    /^occupant_document_(\d+)$/.exec(file.fieldname);
                const guestIndex = guestMatch ? Number(guestMatch[1]) : -1;
                if (
                    file.fieldname !== "booking_person_document" &&
                    (guestIndex < 0 || guestIndex >= savedGuests.length)
                ) {
                    await client.query("ROLLBACK");
                    return res.status(400).json({
                        success: false,
                        message: "An uploaded document is not associated with a booking person or guest.",
                    });
                }
                if (seenDocumentFields.has(file.fieldname)) {
                    await client.query("ROLLBACK");
                    return res.status(400).json({
                        success: false,
                        message: "Only one document may be uploaded for each booking person or guest.",
                    });
                }
                if (!isSupportedDocument(file)) {
                    await client.query("ROLLBACK");
                    return res.status(400).json({
                        success: false,
                        message: "Documents must be valid PDF, JPEG, or PNG files.",
                    });
                }
                seenDocumentFields.add(file.fieldname);
                const encrypted = encryptBookingDocument(file.buffer, documentKey);
                await client.query(
                    `
                    INSERT INTO booking_documents (
                        id,
                        booking_id,
                        guest_id,
                        person_type,
                        content_type,
                        encrypted_content,
                        iv,
                        auth_tag,
                        uploaded_by
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                    `,
                    [
                        randomUUID(),
                        booking.id,
                        guestIndex < 0 ? null : savedGuests[guestIndex].id,
                        guestIndex < 0 ? "BOOKING_PERSON" : "OCCUPANT",
                        file.mimetype,
                        encrypted.encryptedContent,
                        encrypted.iv,
                        encrypted.authTag,
                        userId,
                    ]
                );
            }
        }

        await client.query("COMMIT");
        return res.json({
            success: true,
            booking: {
                id: booking.id,
                booking_reference: booking.booking_reference,
                approval_status: approvalMustReset
                    ? "PENDING"
                    : booking.approval_status,
            },
            guests: savedGuests,
        });
    } catch (error) {
        await client.query("ROLLBACK");
        console.error("Booking update error:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to update this booking.",
        });
    } finally {
        client.release();
    }
});

router.delete("/:bookingId", async (req, res) => {
    const userId = req.authUser?.id;

    if (!userId) {
        return res.status(401).json({
            success: false,
            message: "Authentication is required.",
        });
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const bookingResult = await client.query(
            `
            SELECT id, created_by, booking_status, approval_status
            FROM bookings
            WHERE id = $1
            FOR UPDATE
            `,
            [req.params.bookingId]
        );

        if (bookingResult.rowCount === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({
                success: false,
                message: "Booking was not found.",
            });
        }

        const booking = bookingResult.rows[0];
        if (
            booking.created_by !== userId &&
            req.authUser?.role !== "ADMIN"
        ) {
            await client.query("ROLLBACK");
            return res.status(403).json({
                success: false,
                message: "Only the booking creator or an ADMIN can delete this booking.",
            });
        }

        if (
            booking.booking_status !== "PENDING_APPROVAL" ||
            booking.approval_status !== "PENDING"
        ) {
            await client.query("ROLLBACK");
            return res.status(409).json({
                success: false,
                message: "Only incomplete or pending bookings can be deleted.",
            });
        }

        const operationalRecords = await client.query(
            `
            SELECT EXISTS (
                SELECT 1 FROM payments WHERE booking_id = $1
            ) OR EXISTS (
                SELECT 1 FROM allotments WHERE booking_id = $1
            ) OR EXISTS (
                SELECT 1 FROM booking_legacy_bill_rates WHERE booking_id = $1
            ) AS has_operational_records
            `,
            [booking.id]
        );

        if (operationalRecords.rows[0].has_operational_records) {
            await client.query("ROLLBACK");
            return res.status(409).json({
                success: false,
                message: "This booking has financial or allotment records and cannot be deleted.",
            });
        }

        await client.query(
            "DELETE FROM booking_acceptances WHERE booking_id = $1",
            [booking.id]
        );
        await client.query(
            "DELETE FROM booking_guests WHERE booking_id = $1",
            [booking.id]
        );
        await client.query(
            "DELETE FROM booking_service_members WHERE booking_id = $1",
            [booking.id]
        );
        await client.query(
            "DELETE FROM booking_pricing WHERE booking_id = $1",
            [booking.id]
        );
        await client.query(
            "DELETE FROM bookings WHERE id = $1",
            [booking.id]
        );

        await client.query("COMMIT");
        return res.json({ success: true });
    } catch (error) {
        await client.query("ROLLBACK");
        console.error("Booking deletion error:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to delete this booking.",
        });
    } finally {
        client.release();
    }
});

router.get("/:bookingId/resume", async (req, res) => {
    const userId = req.authUser?.id;

    if (!userId) {
        return res.status(401).json({
            success: false,
            message: "Authentication is required.",
        });
    }

    try {
        const bookingResult = await pool.query(
            `
            SELECT
                b.id,
                b.booking_reference,
                b.booking_type,
                b.check_in_date::TEXT AS check_in_date,
                b.expected_check_out_date::TEXT AS check_out_date,
                b.number_of_guests,
                b.booking_status,
                b.approval_status,
                b.created_by,
                sm.service_number,
                sm.rank AS service_rank,
                sm.full_name AS service_name,
                sm.mobile_number AS service_mobile,
                sm.address AS service_address,
                wp.current_step,
                wp.progress_data
            FROM bookings b
            LEFT JOIN booking_service_members sm
                ON sm.booking_id = b.id
            LEFT JOIN booking_workflow_progress wp
                ON wp.booking_id = b.id
            WHERE b.id = $1
            `,
            [req.params.bookingId]
        );

        if (bookingResult.rowCount === 0) {
            return res.status(404).json({
                success: false,
                message: "Booking was not found.",
            });
        }

        const booking = bookingResult.rows[0];
        const isAwaitingApproval =
            booking.booking_status === "PENDING_APPROVAL" &&
            booking.approval_status === "PENDING";
        const isApprovedPendingWorkflow =
            booking.booking_status === "PENDING_APPROVAL" &&
            booking.approval_status === "APPROVED";
        const canContinueApprovedWorkflow =
            isApprovedPendingWorkflow &&
            ["ADMIN", "RECEPTIONIST"].includes(
                String(req.authUser?.role ?? "")
            );

        if (
            booking.created_by !== userId &&
            req.authUser?.role !== "ADMIN" &&
            !canContinueApprovedWorkflow
        ) {
            return res.status(403).json({
                success: false,
                message: "Only the booking creator or an ADMIN can resume this booking.",
            });
        }

        if (
            !isAwaitingApproval &&
            !isApprovedPendingWorkflow
        ) {
            return res.status(409).json({
                success: false,
                message: "This booking is no longer at a resumable workflow stage.",
            });
        }

        const [
            guestResult,
            acceptanceResult,
            pricingResult,
            paymentResult,
            activeAllotmentResult,
        ] =
            await Promise.all([
                pool.query(
                    `
                    SELECT
                        g.id,
                        g.guest_name,
                        g.gender,
                        g.guest_category,
                        g.relationship,
                        g.mobile_number,
                        g.address,
                        g.identity_proof_type,
                        g.relationship_proof_type,
                        g.relationship_proof_number,
                        g.identity_type,
                        bg.is_primary_guest
                    FROM booking_guests bg
                    INNER JOIN guests g ON g.id = bg.guest_id
                    WHERE bg.booking_id = $1
                    ORDER BY bg.is_primary_guest DESC, bg.created_at ASC
                    `,
                    [booking.id]
                ),
                pool.query(
                    `
                    SELECT
                        ba.guest_id,
                        g.guest_name,
                        ba.room_id,
                        r.room_number,
                        rc.category_name,
                        ba.bed_id,
                        ba.guest_type,
                        bd.bed_number
                    FROM booking_acceptances ba
                    INNER JOIN guests g ON g.id = ba.guest_id
                    INNER JOIN rooms r ON r.id = ba.room_id
                    INNER JOIN room_categories rc ON rc.id = r.category_id
                    LEFT JOIN beds bd ON bd.id = ba.bed_id
                    WHERE
                        ba.booking_id = $1
                        AND ba.acceptance_status = 'ACCEPTED'
                    ORDER BY g.guest_name
                    `,
                    [booking.id]
                ),
                pool.query(
                    `
                    SELECT
                        guest_type AS "guestType",
                        accommodation_category AS "accommodationCategory",
                        accommodation_rate AS "accommodationRate",
                        accommodation_days AS "accommodationDays",
                        accommodation_amount AS "accommodationAmount",
                        additional_retired_members AS "additionalRetiredMembers",
                        additional_retired_amount AS "additionalRetiredAmount",
                        additional_other_relations AS "additionalOtherRelations",
                        additional_other_relation_amount AS "additionalOtherRelationAmount",
                        additional_member_amount AS "additionalMemberAmount",
                        total_amount AS "totalAmount"
                    FROM booking_pricing
                    WHERE booking_id = $1
                    `,
                    [booking.id]
                ),
                pool.query(
                    `
                    SELECT
                        id,
                        amount,
                        payment_method,
                        transaction_number,
                        payment_date::TEXT AS payment_date,
                        remarks
                    FROM payments
                    WHERE booking_id = $1
                    ORDER BY created_at DESC
                    LIMIT 1
                    `,
                    [booking.id]
                ),
                pool.query(
                    `
                    SELECT 1
                    FROM allotments
                    WHERE booking_id = $1
                      AND allotment_status = 'ALLOTTED'
                    LIMIT 1
                    `,
                    [booking.id]
                ),
            ]);

        const payment = paymentResult.rows[0] ?? null;
        const invoiceResult = payment
            ? await pool.query(
                `
                SELECT
                    booking_invoices.id,
                    booking_invoices.booking_id,
                    booking_invoices.invoice_number,
                    booking_invoices.invoice_type,
                    booking_invoices.invoice_date::TEXT AS invoice_date,
                    booking_invoices.amount,
                    booking_invoices.payment_id,
                    payments.payment_method,
                    payments.transaction_number,
                    payments.payment_date::TEXT AS payment_date
                FROM booking_invoices
                INNER JOIN payments
                    ON payments.id = booking_invoices.payment_id
                WHERE booking_invoices.payment_id = $1
                ORDER BY booking_invoices.created_at DESC
                LIMIT 1
                `,
                [payment.id]
            )
            : { rows: [] };
        const invoice = invoiceResult.rows[0] ?? null;

        const progressData =
            booking.progress_data &&
            typeof booking.progress_data === "object"
                ? booking.progress_data
                : {};
        const storedStep = String(booking.current_step || "");
        const acceptedCount = acceptanceResult.rows.length;
        const pricing = pricingResult.rows[0] ?? null;

        const currentStep = isApprovedPendingWorkflow
            ? acceptedCount !== Number(booking.number_of_guests) ||
                !pricing
                ? null
                : !payment
                    ? "PAYMENT"
                    : !invoice
                        ? "INVOICE"
                        : (activeAllotmentResult.rowCount ?? 0) === 0
                            ? "ROOM_LOCKED"
                            : null
            : resolveResumableBookingStep({
                acceptedGuestCount: acceptedCount,
                requiredGuestCount: Number(booking.number_of_guests),
                storedStep,
                hasPricing: Boolean(pricing),
            });

        if (!currentStep) {
            return res.status(409).json({
                success: false,
                message: isApprovedPendingWorkflow
                    ? "The approved booking has already completed its next workflow step or is missing required booking data."
                    : "This booking has already completed its booking submission steps.",
            });
        }

        return res.json({
            success: true,
            booking: {
                ...booking,
                service_member: {
                    service_number: booking.service_number,
                    rank: booking.service_rank,
                    full_name: booking.service_name,
                    mobile: booking.service_mobile,
                    address: booking.service_address,
                },
                guests: guestResult.rows,
            },
            current_step: currentStep,
            progress_data: progressData,
            accepted_accommodation: acceptanceResult.rows,
            pricing,
            payment,
            invoice,
        });
    } catch (error) {
        console.error("Booking resume error:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to load the saved booking progress.",
        });
    }
});

router.put("/:bookingId/progress", async (req, res) => {
    const userId = req.authUser?.id;
    const currentStep = req.body?.current_step;
    const progressData = req.body?.progress_data ?? {};

    if (!userId) {
        return res.status(401).json({
            success: false,
            message: "Authentication is required.",
        });
    }
    if (
        typeof currentStep !== "string" ||
        !resumableSteps.has(currentStep) &&
            currentStep !== "COMPLETED"
    ) {
        return res.status(400).json({
            success: false,
            message: "A valid booking workflow step is required.",
        });
    }
    if (
        !progressData ||
        typeof progressData !== "object" ||
        Array.isArray(progressData)
    ) {
        return res.status(400).json({
            success: false,
            message: "Booking progress data must be an object.",
        });
    }

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const bookingResult = await client.query(
            `
            SELECT id, created_by, booking_status, approval_status, number_of_guests
            FROM bookings
            WHERE id = $1
            FOR UPDATE
            `,
            [req.params.bookingId]
        );
        if (bookingResult.rowCount === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({
                success: false,
                message: "Booking was not found.",
            });
        }

        const booking = bookingResult.rows[0];
        if (
            booking.created_by !== userId &&
            req.authUser?.role !== "ADMIN"
        ) {
            await client.query("ROLLBACK");
            return res.status(403).json({
                success: false,
                message: "Only the booking creator or an ADMIN can update its progress.",
            });
        }
        if (
            booking.booking_status !== "PENDING_APPROVAL" ||
            booking.approval_status !== "PENDING"
        ) {
            await client.query("ROLLBACK");
            return res.status(409).json({
                success: false,
                message: "Progress cannot be changed after the booking leaves the pending state.",
            });
        }

        if (["GUEST_TYPE", "RATE", "BOOKING_CONFIRMATION", "COMPLETED"].includes(currentStep)) {
            const acceptedResult = await client.query(
                `
                SELECT COUNT(DISTINCT guest_id)::INTEGER AS accepted_count
                FROM booking_acceptances
                WHERE booking_id = $1
                    AND acceptance_status = 'ACCEPTED'
                `,
                [booking.id]
            );
            if (
                Number(acceptedResult.rows[0]?.accepted_count ?? 0) <
                Number(booking.number_of_guests)
            ) {
                await client.query("ROLLBACK");
                return res.status(409).json({
                    success: false,
                    message: "Every guest must have an accepted accommodation before this step.",
                });
            }
        }

        if (currentStep === "COMPLETED") {
            const pricingResult = await client.query(
                "SELECT 1 FROM booking_pricing WHERE booking_id = $1 LIMIT 1",
                [booking.id]
            );
            if ((pricingResult.rowCount ?? 0) === 0) {
                await client.query("ROLLBACK");
                return res.status(409).json({
                    success: false,
                    message: "Pricing must be saved before completing the booking submission.",
                });
            }
        }

        const guestType = progressData.guest_type;
        if (
            guestType !== undefined &&
            !["ESM", "SERVING", "CIVILIAN"].includes(guestType)
        ) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                success: false,
                message: "The saved guest type is invalid.",
            });
        }

        const selections = progressData.availability_selections;
        if (selections !== undefined) {
            if (
                !Array.isArray(selections) ||
                selections.length > Number(booking.number_of_guests) ||
                selections.some((selection: unknown) =>
                    !selection ||
                    typeof selection !== "object" ||
                    typeof (selection as Record<string, unknown>).roomId !== "string" ||
                    typeof (selection as Record<string, unknown>).guestId !== "string"
                )
            ) {
                await client.query("ROLLBACK");
                return res.status(400).json({
                    success: false,
                    message: "Saved accommodation selections are invalid.",
                });
            }

            const guestIds = await client.query(
                "SELECT guest_id FROM booking_guests WHERE booking_id = $1",
                [booking.id]
            );
            const bookingGuestIds = new Set(
                guestIds.rows.map((row) => row.guest_id)
            );
            if (
                selections.some(
                    (selection: { guestId: string }) =>
                        !bookingGuestIds.has(selection.guestId)
                )
            ) {
                await client.query("ROLLBACK");
                return res.status(400).json({
                    success: false,
                    message: "A saved accommodation selection references a guest outside this booking.",
                });
            }
        }

        await client.query(
            `
            INSERT INTO booking_workflow_progress (
                booking_id, current_step, progress_data, updated_by, updated_at
            )
            VALUES ($1, $2, $3::JSONB, $4, CURRENT_TIMESTAMP)
            ON CONFLICT (booking_id)
            DO UPDATE SET
                current_step = EXCLUDED.current_step,
                progress_data =
                    booking_workflow_progress.progress_data ||
                    EXCLUDED.progress_data,
                updated_by = EXCLUDED.updated_by,
                updated_at = CURRENT_TIMESTAMP
            `,
            [booking.id, currentStep, JSON.stringify(progressData), userId]
        );
        await client.query("COMMIT");
        return res.json({ success: true, current_step: currentStep });
    } catch (error) {
        await client.query("ROLLBACK");
        console.error("Booking progress update error:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to save booking progress.",
        });
    } finally {
        client.release();
    }
});

router.post("/:bookingId/pricing", async (req, res) => {
    const userId = req.authUser?.id;

    if (!userId) {
        return res.status(401).json({
            success: false,
            message: "Authentication is required.",
        });
    }

    const supportedGuestTypes: GuestType[] = [
        "ESM",
        "SERVING",
        "CIVILIAN",
    ];
    const guestType = supportedGuestTypes.find(
        (value) => value === req.body?.guest_type
    );
    const requestedCategory =
        req.body?.accommodation_category;

    if (!guestType) {
        return res.status(400).json({
            success: false,
            message: "A valid guest type is required.",
        });
    }

    if (typeof requestedCategory !== "string") {
        return res.status(400).json({
            success: false,
            message: "Accommodation category is required.",
        });
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const bookingResult = await client.query(
            `
            SELECT
                id,
                created_by,
                number_of_guests,
                check_in_date::TEXT AS check_in_date,
                expected_check_out_date::TEXT AS check_out_date,
                approval_status
            FROM bookings
            WHERE id = $1
            FOR UPDATE
            `,
            [req.params.bookingId]
        );

        if (bookingResult.rowCount === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({
                success: false,
                message: "Booking was not found.",
            });
        }

        const booking = bookingResult.rows[0];

        if (
            booking.created_by !== userId &&
            req.authUser?.role !== "ADMIN"
        ) {
            await client.query("ROLLBACK");
            return res.status(403).json({
                success: false,
                message:
                    "Only the booking creator or an ADMIN can save its pricing.",
            });
        }

        if (booking.approval_status !== "PENDING") {
            await client.query("ROLLBACK");
            return res.status(409).json({
                success: false,
                message: "Pricing cannot be changed after the booking is approved or rejected.",
            });
        }

        const existingPayment = await client.query(
            "SELECT 1 FROM payments WHERE booking_id = $1 LIMIT 1",
            [booking.id]
        );

        if ((existingPayment.rowCount ?? 0) > 0) {
            await client.query("ROLLBACK");
            return res.status(409).json({
                success: false,
                message: "Pricing cannot be changed after a payment has been recorded.",
            });
        }

        const acceptanceResult = await client.query(
            `
            SELECT
                rc.category_name,
                COUNT(DISTINCT ba.guest_id)::INTEGER AS guest_count,
                COUNT(DISTINCT ba.room_id)::INTEGER AS room_count
            FROM booking_acceptances ba
            INNER JOIN rooms r
                ON r.id = ba.room_id
            INNER JOIN room_categories rc
                ON rc.id = r.category_id
            WHERE
                ba.booking_id = $1
                AND ba.acceptance_status = 'ACCEPTED'
            GROUP BY rc.category_name
            `,
            [booking.id]
        );

        if (acceptanceResult.rowCount !== 1) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                success: false,
                message:
                    "Pricing requires accepted accommodations of one supported category.",
            });
        }

        const accepted = acceptanceResult.rows[0];
        const acceptedGuestCount = Number(accepted.guest_count);
        if (acceptedGuestCount !== Number(booking.number_of_guests)) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                success: false,
                message:
                    "Every guest must have an accepted room or bed before pricing.",
            });
        }

        const overCapacityRoom = await client.query(
            `
            SELECT r.room_number
            FROM booking_acceptances ba
            INNER JOIN rooms r
                ON r.id = ba.room_id
            LEFT JOIN room_rate_cards card
                ON card.room_id = r.id
            WHERE
                ba.booking_id = $1
                AND ba.acceptance_status = 'ACCEPTED'
            GROUP BY
                r.id,
                r.room_number,
                r.total_beds,
                card.room_capacity,
                card.bed_capacity
            HAVING COUNT(DISTINCT ba.guest_id) > LEAST(
                r.total_beds,
                COALESCE(card.room_capacity, r.total_beds),
                COALESCE(card.bed_capacity, r.total_beds)
            )
            LIMIT 1
            `,
            [booking.id]
        );
        if ((overCapacityRoom.rowCount ?? 0) > 0) {
            await client.query("ROLLBACK");
            return res.status(409).json({
                success: false,
                message:
                    `Accepted occupants exceed the configured capacity for room ${overCapacityRoom.rows[0].room_number}.`,
            });
        }

        const normalizedCategory = String(accepted.category_name)
            .trim()
            .toUpperCase()
            .replace(/[\s-]+/g, "_");

        const supportedCategories: AccommodationCategory[] = [
            "AC",
            "NON_AC",
            "DORMITORY",
            "VIP",
            "HALL",
        ];

        const accommodationCategory =
            supportedCategories.find(
                (category) => category === normalizedCategory
            );

        if (!accommodationCategory) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                success: false,
                message:
                    `Pricing is not configured for accommodation category "${accepted.category_name}".`,
            });
        }

        if (
            normalizedCategory !==
            String(requestedCategory)
                .trim()
                .toUpperCase()
                .replace(/[\s-]+/g, "_")
        ) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                success: false,
                message:
                    "The displayed accommodation category does not match the accepted room or bed.",
            });
        }

        const rateField = roomRateColumnForGuestType(guestType);
        let unitRates: number[];
        let accommodationUnits = Number(accepted.room_count);
        let dmBedRateDetails: Array<{
            roomName: string;
            bedNumber: number;
            guestName: string;
            relationship: string;
            guestType: GuestType;
            dailyRate: number;
            stayAmount: number;
        }> = [];

        if (accommodationCategory === "DORMITORY") {
            const bedRateResult = await client.query(
                `
                SELECT
                    r.room_number,
                    bd.bed_number,
                    g.guest_name,
                    g.relationship,
                    ba.guest_type,
                    card.esm_room_rate,
                    card.serving_room_rate,
                    card.civilian_room_rate
                FROM booking_acceptances ba
                INNER JOIN booking_guests bg
                    ON bg.booking_id = ba.booking_id
                    AND bg.guest_id = ba.guest_id
                INNER JOIN guests g
                    ON g.id = ba.guest_id
                INNER JOIN rooms r
                    ON r.id = ba.room_id
                INNER JOIN beds bd
                    ON bd.id = ba.bed_id
                LEFT JOIN room_rate_cards card
                    ON card.room_id = r.id
                WHERE
                    ba.booking_id = $1
                    AND ba.acceptance_status = 'ACCEPTED'
                ORDER BY r.room_number, bd.bed_number
                `,
                [booking.id]
            );

            if (bedRateResult.rows.length !== acceptedGuestCount) {
                await client.query("ROLLBACK");
                return res.status(400).json({
                    success: false,
                    message: "Every Dormitory guest must have an accepted bed before pricing.",
                });
            }

            const resolvedBedRates = bedRateResult.rows.map(
                (row: {
                    room_number: string;
                    bed_number: number;
                    guest_name: string;
                    relationship: string | null;
                    guest_type: string | null;
                    esm_room_rate: string | number | null;
                    serving_room_rate: string | number | null;
                    civilian_room_rate: string | number | null;
                }) => {
                    const relationship = String(row.relationship || "OTHER").toUpperCase();
                    const occupantGuestType = resolveDormitoryGuestType(
                        isGuestType(row.guest_type) ? row.guest_type : null,
                        relationship,
                        guestType
                    );
                    const configuredRate =
                        occupantGuestType === "ESM"
                            ? row.esm_room_rate
                            : occupantGuestType === "SERVING"
                                ? row.serving_room_rate
                                : row.civilian_room_rate;

                    return {
                        roomName: row.room_number,
                        bedNumber: Number(row.bed_number),
                        guestName: row.guest_name,
                        relationship,
                        guestType: occupantGuestType,
                        dailyRate: configuredRate === null
                            ? Number.NaN
                            : Number(configuredRate),
                    };
                }
            );

            unitRates = resolvedBedRates.map((detail) => detail.dailyRate);
            accommodationUnits = resolvedBedRates.length;
            dmBedRateDetails = resolvedBedRates.map((detail) => ({
                ...detail,
                stayAmount: 0,
            }));
        } else {
            const rateResult = await client.query(
                `
                SELECT DISTINCT
                    r.id AS unit_id,
                    card.${rateField} AS unit_rate
                FROM booking_acceptances ba
                INNER JOIN rooms r
                    ON r.id = ba.room_id
                LEFT JOIN room_rate_cards card
                    ON card.room_id = r.id
                WHERE
                    ba.booking_id = $1
                    AND ba.acceptance_status = 'ACCEPTED'
                ORDER BY unit_id
                `,
                [booking.id]
            );
            unitRates = rateResult.rows.map(
                (row: { unit_rate: string | number | null }) =>
                    row.unit_rate === null ? Number.NaN : Number(row.unit_rate)
            );
        }

        const pricing = calculateBookingPricing({
            guestType,
            accommodationCategory,
            checkInDate: booking.check_in_date,
            checkOutDate: booking.check_out_date,
            roomCount: accommodationUnits,
            unitRates,
        });

        if (dmBedRateDetails.length > 0) {
            dmBedRateDetails = dmBedRateDetails.map((detail) => ({
                ...detail,
                stayAmount: Math.round(
                    (detail.dailyRate * pricing.accommodationDays + Number.EPSILON) * 100
                ) / 100,
            }));
        }

        const savedPricing = await client.query(
            `
            INSERT INTO booking_pricing (
                booking_id,
                guest_type,
                accommodation_category,
                accommodation_rate,
                accommodation_days,
                accommodation_amount,
                additional_retired_members,
                additional_retired_amount,
                additional_other_relations,
                additional_other_relation_amount,
                additional_member_amount,
                total_amount,
                calculated_by
            )
            VALUES (
                $1, $2, $3, $4, $5, $6, $7,
                $8, $9, $10, $11, $12, $13
            )
            ON CONFLICT (booking_id)
            DO UPDATE SET
                guest_type = EXCLUDED.guest_type,
                accommodation_category =
                    EXCLUDED.accommodation_category,
                accommodation_rate =
                    EXCLUDED.accommodation_rate,
                accommodation_days =
                    EXCLUDED.accommodation_days,
                accommodation_amount =
                    EXCLUDED.accommodation_amount,
                additional_retired_members =
                    EXCLUDED.additional_retired_members,
                additional_retired_amount =
                    EXCLUDED.additional_retired_amount,
                additional_other_relations =
                    EXCLUDED.additional_other_relations,
                additional_other_relation_amount =
                    EXCLUDED.additional_other_relation_amount,
                additional_member_amount =
                    EXCLUDED.additional_member_amount,
                total_amount = EXCLUDED.total_amount,
                calculated_by = EXCLUDED.calculated_by,
                updated_at = CURRENT_TIMESTAMP
            RETURNING
                booking_id,
                guest_type AS "guestType",
                accommodation_category AS "accommodationCategory",
                accommodation_rate AS "accommodationRate",
                accommodation_days AS "accommodationDays",
                accommodation_amount AS "accommodationAmount",
                additional_retired_members AS "additionalRetiredMembers",
                additional_retired_amount AS "additionalRetiredAmount",
                additional_other_relations AS "additionalOtherRelations",
                additional_other_relation_amount AS "additionalOtherRelationAmount",
                additional_member_amount AS "additionalMemberAmount",
                total_amount AS "totalAmount"
            `,
            [
                booking.id,
                pricing.guestType,
                pricing.accommodationCategory,
                pricing.accommodationRate,
                pricing.accommodationDays,
                pricing.accommodationAmount,
                pricing.additionalRetiredMembers,
                pricing.additionalRetiredAmount,
                pricing.additionalOtherRelations,
                pricing.additionalOtherRelationAmount,
                pricing.additionalMemberAmount,
                pricing.totalAmount,
                userId,
            ]
        );

        await client.query(
            "UPDATE bookings SET guest_type = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
            [pricing.guestType, booking.id]
        );

        await client.query(
            `
            INSERT INTO booking_workflow_progress (
                booking_id,
                current_step,
                progress_data,
                updated_by,
                updated_at
            )
            VALUES (
                $1,
                'BOOKING_CONFIRMATION',
                jsonb_build_object(
                    'guest_type', $2::TEXT,
                    'dm_bed_rate_details', $4::JSONB
                ),
                $3,
                CURRENT_TIMESTAMP
            )
            ON CONFLICT (booking_id)
            DO UPDATE SET
                current_step = 'BOOKING_CONFIRMATION',
                progress_data =
                    booking_workflow_progress.progress_data ||
                    jsonb_build_object(
                        'guest_type', $2::TEXT,
                        'dm_bed_rate_details', $4::JSONB
                    ),
                updated_by = EXCLUDED.updated_by,
                updated_at = CURRENT_TIMESTAMP
            `,
            [booking.id, pricing.guestType, userId, JSON.stringify(dmBedRateDetails)]
        );

        await client.query("COMMIT");

        return res.status(200).json({
            success: true,
            pricing: {
                ...savedPricing.rows[0],
                dmBedRateDetails,
            },
        });
    } catch (error) {
        await client.query("ROLLBACK");
        if (error instanceof BookingPricingInputError) {
            return res.status(400).json({
                success: false,
                message: error.message,
            });
        }

        console.error("Booking pricing calculation error:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to calculate and save booking pricing.",
        });
    } finally {
        client.release();
    }
});

router.get("/:bookingId/documents", async (req, res) => {
    const userId = req.authUser?.id;
    if (!userId) {
        return res.status(401).json({
            success: false,
            message: "Authentication is required.",
        });
    }

    try {
        const result = await pool.query(
            `
            SELECT
                d.id,
                d.person_type,
                d.content_type,
                d.created_at,
                COALESCE(g.guest_name, sm.full_name) AS person_name
            FROM booking_documents d
            INNER JOIN bookings b ON b.id = d.booking_id
            LEFT JOIN guests g ON g.id = d.guest_id
            LEFT JOIN booking_service_members sm
                ON sm.booking_id = d.booking_id
               AND d.person_type = 'BOOKING_PERSON'
            WHERE d.booking_id = $1
              AND (
                b.created_by = $2
                OR $3 = 'ADMIN'
              )
            ORDER BY d.created_at, d.id
            `,
            [req.params.bookingId, userId, req.authUser?.role]
        );
        if (result.rowCount === 0) {
            const bookingResult = await pool.query(
                "SELECT id FROM bookings WHERE id = $1",
                [req.params.bookingId]
            );
            if (bookingResult.rowCount === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Booking was not found.",
                });
            }
            const ownerResult = await pool.query(
                "SELECT created_by FROM bookings WHERE id = $1",
                [req.params.bookingId]
            );
            if (
                ownerResult.rows[0]?.created_by !== userId &&
                req.authUser?.role !== "ADMIN"
            ) {
                return res.status(403).json({
                    success: false,
                    message: "You are not authorized to access these documents.",
                });
            }
        }
        return res.json({ success: true, documents: result.rows });
    } catch (error) {
        console.error("Booking document list error:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to list booking documents.",
        });
    }
});

router.get("/:bookingId/documents/:documentId", async (req, res) => {
    const userId = req.authUser?.id;
    if (!userId) {
        return res.status(401).json({
            success: false,
            message: "Authentication is required.",
        });
    }

    try {
        const result = await pool.query(
            `
            SELECT
                d.content_type,
                d.encrypted_content,
                d.iv,
                d.auth_tag,
                b.created_by
            FROM booking_documents d
            INNER JOIN bookings b ON b.id = d.booking_id
            WHERE d.id = $1
              AND d.booking_id = $2
            `,
            [req.params.documentId, req.params.bookingId]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({
                success: false,
                message: "Booking document was not found.",
            });
        }

        const document = result.rows[0];
        if (
            document.created_by !== userId &&
            req.authUser?.role !== "ADMIN"
        ) {
            return res.status(403).json({
                success: false,
                message: "You are not authorized to download this document.",
            });
        }

        const content = decryptBookingDocument(
            document.encrypted_content,
            document.iv,
            document.auth_tag,
            getDocumentEncryptionKey()
        );
        const extension =
            document.content_type === "application/pdf"
                ? "pdf"
                : document.content_type === "image/png"
                    ? "png"
                    : "jpg";
        res.set({
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Type": document.content_type,
            "Content-Disposition":
                `attachment; filename="booking-document.${extension}"`,
        });
        return res.send(content);
    } catch (error) {
        console.error("Booking document download error:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to download the booking document.",
        });
    }
});

export default router;