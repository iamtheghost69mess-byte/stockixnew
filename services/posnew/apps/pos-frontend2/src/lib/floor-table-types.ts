export type FloorTableStatus =
  | "available"
  | "reserved"
  | "occupied"
  | "billed"
  | "closed";

export type FloorTable = {
  id: string;
  tableNo: number;
  name: string;
  seats: number;
  personsSeated: number;
  pricePerPerson: number;
  reservatorName: string | null;
  reservatorPhone: string | null;
  reservatorIsVip: boolean;
  status: FloorTableStatus;
  /**
   * When false, table is hidden from the POS floor (back-office / reservations only).
   * Legacy rows without the field are treated as visible on POS.
   */
  visibleInPos: boolean;
  /**
   * Normalized floor-plan position (0–1) for table center; `null` = auto grid until placed.
   * Persisted via API as `floorAnchorX` / `floorAnchorY`.
   */
  floorAnchorX: number | null;
  floorAnchorY: number | null;
};

export function deriveFloorTableStatus(input: {
  personsSeated: number;
  reservatorName: string | null | undefined;
}): FloorTableStatus {
  const persons = Math.max(0, Math.floor(Number(input.personsSeated) || 0));
  const hasRes = Boolean(String(input.reservatorName ?? "").trim());
  if (persons > 0) return "occupied";
  if (hasRes) return "reserved";
  return "available";
}

/** For edit modal: use Automatic when stored status matches derived rules; otherwise preselect the manual status. */
export function floorTableStatusModeForForm(
  table: Pick<FloorTable, "status" | "personsSeated" | "reservatorName">,
): "auto" | FloorTableStatus {
  const derived = deriveFloorTableStatus({
    personsSeated: table.personsSeated,
    reservatorName: table.reservatorName,
  });
  return table.status === derived ? "auto" : table.status;
}

export function isTableAlmostFull(table: Pick<FloorTable, "seats" | "personsSeated">): boolean {
  const seats = Math.max(0, Math.floor(Number(table.seats) || 0));
  const persons = Math.max(0, Math.floor(Number(table.personsSeated) || 0));
  return seats > 0 && persons > 0 && persons >= seats;
}
