export type RoomGenderRestriction = "ANY" | "MALE" | "FEMALE";

export const isRoomGenderAllowed = (
  restriction: string | null | undefined,
  guestGender: string | null | undefined
): boolean => {
  const normalizedRestriction = String(restriction ?? "ANY")
    .trim()
    .toUpperCase();
  if (normalizedRestriction === "ANY") {
    return true;
  }

  return normalizedRestriction ===
    String(guestGender ?? "").trim().toUpperCase();
};
