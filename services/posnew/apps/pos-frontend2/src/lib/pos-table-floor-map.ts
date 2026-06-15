import { clampFloorAnchor } from "@/lib/floor-layout";
import type { FloorTable, FloorTableStatus } from "@/lib/floor-table-types";
import { normalizePosTableRowId, type PosTableCreateBody, type PosTableRow } from "@/lib/pos-tables-api";

/** Stored on server as `free` | `reserved` | `occupied`. */
export function apiTableStatusToFloor(status: string | undefined): FloorTableStatus {
  const c = String(status || "").toLowerCase();
  if (c === "reserved") return "reserved";
  if (c === "occupied") return "occupied";
  return "available";
}

export function floorStatusToApi(status: FloorTableStatus): "free" | "reserved" | "occupied" {
  if (status === "reserved") return "reserved";
  if (status === "occupied") return "occupied";
  return "free";
}

export function posTableRowToFloor(row: PosTableRow): FloorTable {
  const tableNo = row.tableNo ?? 0;
  const nameFromApi = typeof row.name === "string" && row.name.trim() ? row.name.trim() : "";
  const ax = row.floorAnchorX;
  const ay = row.floorAnchorY;
  return {
    id: normalizePosTableRowId(row),
    tableNo,
    name: nameFromApi || `Table ${tableNo}`,
    seats: Math.max(1, Math.floor(Number(row.seats) || 1)),
    personsSeated: Math.max(0, Math.floor(Number(row.personsSeated) || 0)),
    pricePerPerson: Math.max(0, Number(row.pricePerPerson) || 0),
    reservatorName:
      row.reservatorName != null && String(row.reservatorName).trim() ? String(row.reservatorName).trim() : null,
    reservatorPhone:
      row.reservatorPhone != null && String(row.reservatorPhone).trim() ? String(row.reservatorPhone).trim() : null,
    reservatorIsVip: Boolean(row.reservatorIsVip),
    status: apiTableStatusToFloor(row.status),
    floorAnchorX: ax != null && Number.isFinite(Number(ax)) ? clampFloorAnchor(Number(ax)) : null,
    floorAnchorY: ay != null && Number.isFinite(Number(ay)) ? clampFloorAnchor(Number(ay)) : null,
    visibleInPos: row.visibleInPos !== false,
  };
}

/** POST /api/table — `tableNo` omitted lets the server assign the next number. */
export function floorTableToCreateBody(row: Omit<FloorTable, "id">): PosTableCreateBody {
  const body: PosTableCreateBody = {
    tableNo: row.tableNo,
    seats: row.seats,
    name: row.name,
    pricePerPerson: row.pricePerPerson,
    reservatorName: row.reservatorName,
    reservatorPhone: row.reservatorPhone,
    reservatorIsVip: row.reservatorIsVip,
    personsSeated: row.personsSeated,
    status: floorStatusToApi(row.status),
  };
  if (row.floorAnchorX != null && row.floorAnchorY != null) {
    body.floorAnchorX = clampFloorAnchor(row.floorAnchorX);
    body.floorAnchorY = clampFloorAnchor(row.floorAnchorY);
  }
  body.visibleInPos = row.visibleInPos;
  return body;
}

export function floorTableToUpdateBody(row: Omit<FloorTable, "id">): PosTableCreateBody {
  const body = floorTableToCreateBody(row);
  if (row.floorAnchorX === null && row.floorAnchorY === null) {
    body.floorAnchorX = null;
    body.floorAnchorY = null;
  }
  return body;
}
