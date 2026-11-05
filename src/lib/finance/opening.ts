/** True for opening-balance entries (pre-existing money), including ones created before the flag existed. */
export const isOpeningEntry = (e: { is_opening?: boolean; note?: string | null }) => e.is_opening === true || e.note === "Opening balance";
