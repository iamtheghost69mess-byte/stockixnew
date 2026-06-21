const createHttpError = require("http-errors");
const BankStatementLine = require("../models/bankStatementLineModel");

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 5000;
const REQUIRED_COLUMNS = ["postedAt", "amount"];
const KNOWN_COLUMNS = new Set(["postedAt", "amount", "description", "externalId"]);

/** Round to two decimals with banker-safe arithmetic. */
function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Strip UTF-8 BOM and normalize CRLF. */
function normalizeText(buffer) {
  let text = buffer.toString("utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return text.replace(/\r\n?/g, "\n");
}

/**
 * Minimal RFC-4180 CSV split that supports quoted fields, escaped quotes (""),
 * and commas inside quotes. Returns an array of string fields for one logical row.
 * Consumes multi-line quoted fields; returns `null` if the row is incomplete.
 */
function parseCsvRow(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (inQuotes) return null;
  out.push(cur);
  return out;
}

/**
 * Split text into logical CSV rows honoring quoted multi-line fields.
 * Returns an array of rows where each row is an array of field strings.
 */
function splitCsv(text) {
  const rows = [];
  let buffer = "";
  const lines = text.split("\n");
  for (const line of lines) {
    buffer = buffer ? `${buffer}\n${line}` : line;
    const row = parseCsvRow(buffer);
    if (row) {
      buffer = "";
      if (row.length === 1 && row[0] === "") continue;
      rows.push(row);
    }
  }
  if (buffer.trim() !== "") {
    throw createHttpError(400, "CSV ended inside a quoted field.");
  }
  return rows;
}

function normalizeHeader(name) {
  const trimmed = String(name || "").trim();
  const lower = trimmed.toLowerCase();
  const map = {
    postedat: "postedAt",
    posted_at: "postedAt",
    amount: "amount",
    description: "description",
    memo: "description",
    externalid: "externalId",
    external_id: "externalId",
    reference: "externalId",
  };
  return map[lower] || trimmed;
}

function parseAmount(raw) {
  if (raw == null) return Number.NaN;
  let s = String(raw).trim();
  if (!s) return Number.NaN;
  // Remove thousand separators when both `.` and `,` appear (e.g. "1,234.56" or "1.234,56").
  const hasDot = s.includes(".");
  const hasComma = s.includes(",");
  if (hasDot && hasComma) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (hasComma && !hasDot) {
    // "12,50" -> "12.50"; "1,234" (locale thousands) is ambiguous → treat as decimal only if exactly one comma followed by 1–2 digits.
    const m = /^-?\d+,\d{1,2}$/.test(s);
    s = m ? s.replace(",", ".") : s.replace(/,/g, "");
  }
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? round2(n) : Number.NaN;
}

function parseDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  // Accept YYYY-MM-DD or full ISO.
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(s);
  const d = new Date(dateOnly ? `${s}T00:00:00.000Z` : s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function buildDedupeKey({ postedAt, amount, description }) {
  const day = new Date(Date.UTC(postedAt.getUTCFullYear(), postedAt.getUTCMonth(), postedAt.getUTCDate()))
    .toISOString()
    .slice(0, 10);
  const cents = Math.round((Number(amount) || 0) * 100);
  const norm = String(description || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  return `${day}|${cents}|${norm}`;
}

/**
 * Parse the CSV buffer into validated row objects. Does not touch the DB.
 * @returns {{ rows: Array<{postedAt: Date, amount: number, description: string, externalId: string, dedupeKey: string, rowNumber: number}>, errors: Array<{row: number, reason: string}> }}
 */
function parseBankCsv(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw createHttpError(400, "CSV file is empty.");
  }
  if (buffer.length > MAX_BYTES) {
    throw createHttpError(400, `CSV file too large (> ${MAX_BYTES} bytes).`);
  }
  const rows = splitCsv(normalizeText(buffer));
  if (rows.length === 0) {
    throw createHttpError(400, "CSV file has no rows.");
  }
  const header = rows[0].map(normalizeHeader);
  for (const col of REQUIRED_COLUMNS) {
    if (!header.includes(col)) {
      throw createHttpError(400, `Missing required column: ${col}`);
    }
  }
  const bodyRows = rows.slice(1);
  if (bodyRows.length > MAX_ROWS) {
    throw createHttpError(400, `Too many rows (> ${MAX_ROWS}).`);
  }

  const parsed = [];
  const errors = [];
  bodyRows.forEach((fields, idx) => {
    const rowNumber = idx + 2; // 1-based; header is row 1.
    const record = {};
    header.forEach((key, i) => {
      if (KNOWN_COLUMNS.has(key)) record[key] = fields[i];
    });
    const postedAt = parseDate(record.postedAt);
    if (!postedAt) {
      errors.push({ row: rowNumber, reason: `Invalid postedAt: "${record.postedAt || ""}"` });
      return;
    }
    const amount = parseAmount(record.amount);
    if (!Number.isFinite(amount)) {
      errors.push({ row: rowNumber, reason: `Invalid amount: "${record.amount || ""}"` });
      return;
    }
    const description = String(record.description || "").trim();
    const externalId = String(record.externalId || "").trim();
    const dedupeKey = externalId ? "" : buildDedupeKey({ postedAt, amount, description });
    parsed.push({ postedAt, amount, description, externalId, dedupeKey, rowNumber });
  });
  return { rows: parsed, errors };
}

/**
 * Import a CSV v1 bank statement for the tenant.
 * Persists new `BankStatementLine` rows, skips duplicates (per externalId or natural key).
 * @param {Buffer} buffer
 * @param {string} organizationId
 * @returns {Promise<{imported: number, skipped: number, duplicates: Array, errors: Array, lines: Array}>}
 */
async function importBankCsv(buffer, organizationId) {
  if (!organizationId) throw createHttpError(400, "organizationId is required.");
  const { rows, errors } = parseBankCsv(buffer);
  if (rows.length === 0) {
    return { imported: 0, skipped: 0, duplicates: [], errors, lines: [] };
  }

  const externalIds = rows.map((r) => r.externalId).filter(Boolean);
  const dedupeKeys = rows.map((r) => r.dedupeKey).filter(Boolean);

  const existingQuery = { organization: organizationId, $or: [] };
  if (externalIds.length) existingQuery.$or.push({ externalId: { $in: externalIds } });
  if (dedupeKeys.length) existingQuery.$or.push({ dedupeKey: { $in: dedupeKeys } });
  const existing = existingQuery.$or.length
    ? await BankStatementLine.find(existingQuery).select("externalId dedupeKey").lean()
    : [];
  const existingExternal = new Set(existing.filter((e) => e.externalId).map((e) => e.externalId));
  const existingDedupe = new Set(existing.filter((e) => e.dedupeKey).map((e) => e.dedupeKey));

  const toInsert = [];
  const duplicates = [];
  const seenExternal = new Set();
  const seenDedupe = new Set();
  for (const row of rows) {
    if (row.externalId) {
      if (existingExternal.has(row.externalId) || seenExternal.has(row.externalId)) {
        duplicates.push({ row: row.rowNumber, reason: "externalId already imported", externalId: row.externalId });
        continue;
      }
      seenExternal.add(row.externalId);
    } else if (row.dedupeKey) {
      if (existingDedupe.has(row.dedupeKey) || seenDedupe.has(row.dedupeKey)) {
        duplicates.push({ row: row.rowNumber, reason: "natural key already imported" });
        continue;
      }
      seenDedupe.add(row.dedupeKey);
    }
    toInsert.push({
      organization: organizationId,
      postedAt: row.postedAt,
      amount: row.amount,
      description: row.description,
      externalId: row.externalId || "",
      dedupeKey: row.dedupeKey || "",
      status: "unmatched",
    });
  }

  const inserted = toInsert.length
    ? await BankStatementLine.insertMany(toInsert, { ordered: false })
    : [];

  return {
    imported: inserted.length,
    skipped: duplicates.length + errors.length,
    duplicates,
    errors,
    lines: inserted.map((d) => ({
      _id: String(d._id),
      postedAt: d.postedAt,
      amount: d.amount,
      description: d.description,
      externalId: d.externalId,
      status: d.status,
    })),
  };
}

module.exports = {
  parseBankCsv,
  importBankCsv,
  round2,
  // exported for tests
  _internal: { parseCsvRow, parseAmount, parseDate, buildDedupeKey, MAX_BYTES, MAX_ROWS },
};
