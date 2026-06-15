import type { Context } from "hono";
import type { PmsEnv } from "../types.js";

/** Extract the authenticated tenant ID from Hono context. */
export function tenantId(c: Context<PmsEnv>): string {
  return c.get("stockix").tenantId;
}

const MAX_REPORT_DAYS = 366;
const MAX_PAGE_LIMIT = 200;

/** Parse page/limit query params (limit capped at 200). */
export function parsePagination(c: Context<PmsEnv>): {
  page: number;
  limit: number;
  offset: number;
} {
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10) || 1);
  const limit = Math.min(
    Math.max(1, parseInt(c.req.query("limit") ?? "50", 10) || 50),
    MAX_PAGE_LIMIT,
  );
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

export function listMeta(page: number, limit: number, itemCount: number) {
  return { page, limit, hasMore: itemCount === limit };
}

/** Reject report date ranges wider than MAX_REPORT_DAYS. */
export function validateReportDateRange(from: string, to: string): string | null {
  const start = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "Invalid from or to date (use YYYY-MM-DD)";
  }
  if (end < start) return "to must be on or after from";
  const spanDays = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
  if (spanDays > MAX_REPORT_DAYS) {
    return `Date range must not exceed ${MAX_REPORT_DAYS} days`;
  }
  return null;
}

/** Standard error response helpers. */
export const errors = {
  notFound: (c: Context, entity = "resource") =>
    c.json({ error: "not_found", message: `${entity} not found` }, 404),
  dbUnavailable: (c: Context) =>
    c.json({ error: "database_unavailable" }, 503),
  badRequest: (c: Context, message: string) =>
    c.json({ error: "bad_request", message }, 400),
  conflict: (c: Context, message: string) =>
    c.json({ error: "conflict", message }, 409),
} as const;
