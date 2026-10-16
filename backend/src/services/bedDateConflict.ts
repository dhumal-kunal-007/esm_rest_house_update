import { datesOverlap } from "./dateOverlap.js";

type DateValue = string | Date;

type ConflictRow = {
  booking_reference: string;
  check_in_date: DateValue;
  expected_check_out_date: DateValue;
};

type QueryResult<Row> = {
  rows: Row[];
};

type Queryable = {
  query: (
    text: string,
    values?: any[]
  ) => Promise<QueryResult<any>>;
};

export async function checkBedDateConflict(
  client: Queryable,
  bedId: string,
  bookingId: string,
  checkInDate: string,
  checkOutDate: string
): Promise<{
  conflict: boolean;
  bookingReference?: string;
  checkInDate?: DateValue;
  checkOutDate?: DateValue;
}> {
  const bedRoomResult = await client.query(
    `
    SELECT bed.room_id
    FROM rooms r
    INNER JOIN beds bed
      ON bed.room_id = r.id
    WHERE bed.id = $1
    FOR UPDATE OF r
    `,
    [bedId]
  );
  const roomId = bedRoomResult.rows[0]?.room_id as string | undefined;

  if (!roomId) {
    throw new Error("Selected bed was not found.");
  }

  const result = await client.query(
    `
    SELECT
      b.booking_reference,
      b.check_in_date,
      b.expected_check_out_date
    FROM allotments a
    INNER JOIN bookings b
      ON b.id = a.booking_id
    WHERE
      a.room_id = $3
      AND (a.bed_id = $1 OR a.bed_id IS NULL)
      AND a.booking_id <> $2
      AND a.allotment_status = 'ALLOTTED'
      AND b.booking_status NOT IN (
        'CANCELLED',
        'REJECTED'
      )
    ORDER BY
      b.check_in_date ASC
    `,
    [bedId, bookingId, roomId]
  );

  for (const row of result.rows as ConflictRow[]) {
    if (
      datesOverlap(
        row.check_in_date,
        row.expected_check_out_date,
        checkInDate,
        checkOutDate
      )
    ) {
      return {
        conflict: true,
        bookingReference: row.booking_reference,
        checkInDate: row.check_in_date,
        checkOutDate: row.expected_check_out_date,
      };
    }
  }

  return { conflict: false };
}
