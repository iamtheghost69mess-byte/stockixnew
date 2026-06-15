/** Normalize POS platform API list payloads into row objects. */
export function parsePosListRows(data: unknown, listKeys: string[]): Record<string, unknown>[] {
  if (Array.isArray(data)) {
    return data.filter((row): row is Record<string, unknown> => row != null && typeof row === "object");
  }
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    for (const key of listKeys) {
      const val = obj[key];
      if (Array.isArray(val)) {
        return val.filter((row): row is Record<string, unknown> => row != null && typeof row === "object");
      }
    }
  }
  return [];
}

export function formatPosCell(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) return value.map((v) => formatPosCell(v)).join(", ");
  return JSON.stringify(value);
}

export function rowId(row: Record<string, unknown>, index: number): string {
  const id = row.id ?? row._id ?? row.key ?? row.name;
  return id != null ? String(id) : `row-${index}`;
}
