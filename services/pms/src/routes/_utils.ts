import type { Context } from "hono";
import type { PmsEnv } from "../types.js";

/** Extract the authenticated tenant ID from Hono context. */
export function tenantId(c: Context<PmsEnv>): string {
  return c.get("stockix").tenantId;
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
