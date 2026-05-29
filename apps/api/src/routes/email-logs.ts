import { emailLogs, tenants } from "@repo/db/schema";
import type { schema, PostgresJsDatabase } from "@repo/db";
import { and, count, desc, eq, type SQL } from "drizzle-orm";
import type { Context } from "hono";
import { z } from "zod";

export async function handleEmailLogsList(
  c: Context,
  db: PostgresJsDatabase<typeof schema>,
) {
  const page = Math.max(1, Number(c.req.query("page") ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(c.req.query("pageSize") ?? 25) || 25));
  const offset = (page - 1) * pageSize;

  const templateKey = c.req.query("templateKey")?.trim() ?? "";
  const status = c.req.query("status")?.trim() ?? "";
  const tenantIdRaw = c.req.query("tenantId")?.trim() ?? "";

  const conditions: SQL[] = [];
  if (templateKey) {
    conditions.push(eq(emailLogs.templateKey, templateKey));
  }
  if (status) {
    conditions.push(eq(emailLogs.status, status));
  }
  if (tenantIdRaw) {
    const parsed = z.string().uuid().safeParse(tenantIdRaw);
    if (parsed.success) {
      conditions.push(eq(emailLogs.tenantId, parsed.data));
    }
  }

  const fullWhere =
    conditions.length === 0
      ? undefined
      : conditions.length === 1
        ? conditions[0]
        : and(...conditions);

  const countQuery = db.select({ c: count() }).from(emailLogs);
  const dataQuery = db
    .select({
      id: emailLogs.id,
      templateKey: emailLogs.templateKey,
      status: emailLogs.status,
      deliveryStatus: emailLogs.deliveryStatus,
      providerMessageId: emailLogs.providerMessageId,
      error: emailLogs.error,
      tenantId: emailLogs.tenantId,
      tenantSlug: tenants.slug,
      tenantName: tenants.name,
      ownerId: emailLogs.ownerId,
      idempotencyKey: emailLogs.idempotencyKey,
      createdAt: emailLogs.createdAt,
    })
    .from(emailLogs)
    .leftJoin(tenants, eq(tenants.id, emailLogs.tenantId))
    .orderBy(desc(emailLogs.createdAt))
    .limit(pageSize)
    .offset(offset);

  const [countRow] = fullWhere ? await countQuery.where(fullWhere) : await countQuery;
  const rows = fullWhere ? await dataQuery.where(fullWhere) : await dataQuery;

  const total = Number(countRow?.c ?? 0);

  return c.json({
    logs: rows,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
}
