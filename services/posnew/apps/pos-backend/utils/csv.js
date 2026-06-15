function escapeCell(val) {
  if (val === null || val === undefined) return "";
  const s = String(val);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** rows: array of objects; columns: [{ key: 'a' }] or [{ header: 'Title', key: 'a' }] */
function toCsv(rows, columns) {
  const headers = columns.map((c) =>
    typeof c === "string" ? c : c.header || c.key
  );
  const keys = columns.map((c) => (typeof c === "string" ? c : c.key));
  const lines = [
    headers.map(escapeCell).join(","),
    ...rows.map((row) =>
      keys.map((k) => escapeCell(resolveKey(row, k))).join(",")
    ),
  ];
  return lines.join("\r\n");
}

function resolveKey(obj, key) {
  if (key.includes(".")) {
    return key.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
  }
  return obj[key];
}

module.exports = { toCsv, escapeCell };
