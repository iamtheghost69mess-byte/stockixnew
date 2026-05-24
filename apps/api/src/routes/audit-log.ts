import {
  adminAuditLog,
  owners,
  tenants,
} from "@repo/db/schema";
import type { schema, PostgresJsDatabase } from "@repo/db";
import {
  formatAuditActionLabel,
  formatAuditActorLabel,
  formatAuditTargetLabel,
} from "@repo/shared/audit-log";
import { and, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Context } from "hono";
import { z } from "zod";

const targetTenant = alias(tenants, "audit_target_tenant");
const targetOwner = alias(owners, "audit_target_owner");

export async function handleAuditLogList(
  c: Context,
  db: PostgresJsDatabase<typeof schema>,
) {
  const rawPage = c.req.query("page");
  const rawPageSize = c.req.query("pageSize");
  const actionFilter = c.req.query("action")?.trim() ?? "";
  const rawActorId = c.req.query("actorId")?.trim() ?? "";
  const rawTenantId = c.req.query("tenantId")?.trim() ?? "";
  const actorSearch = c.req.query("actor")?.trim() ?? "";
  const tenantSearch = c.req.query("tenant")?.trim() ?? "";

  const page = Math.max(1, Number(rawPage ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(rawPageSize ?? 20) || 20));
  const offset = (page - 1) * pageSize;

  const conditions: SQL[] = [];
  if (actionFilter) {
    conditions.push(ilike(adminAuditLog.action, `%${actionFilter}%`));
  }
  if (rawActorId) {
    const parsed = z.string().uuid().safeParse(rawActorId);
    if (parsed.success) {
      conditions.push(eq(adminAuditLog.actorId, parsed.data));
    }
  } else if (actorSearch) {
    const pat = `%${actorSearch}%`;
    conditions.push(or(ilike(owners.email, pat), ilike(owners.name, pat))!);
  }
  if (rawTenantId) {
    const parsed = z.string().uuid().safeParse(rawTenantId);
    if (parsed.success) {
      conditions.push(eq(adminAuditLog.targetTenantId, parsed.data));
    }
  } else if (tenantSearch) {
    const pat = `%${tenantSearch}%`;
    conditions.push(
      or(ilike(targetTenant.name, pat), ilike(targetTenant.slug, pat))!,
    );
  }

  const fullWhere =
    conditions.length === 0 ? undefined : conditions.length === 1 ? conditions[0] : and(...conditions);

  const baseFrom = db
    .select({ c: count() })
    .from(adminAuditLog)
    .leftJoin(owners, eq(owners.id, adminAuditLog.actorId))
    .leftJoin(targetTenant, eq(targetTenant.id, adminAuditLog.targetTenantId))
    .leftJoin(targetOwner, eq(targetOwner.id, adminAuditLog.targetOwnerId));

  const baseData = db
    .select({
      id: adminAuditLog.id,
      action: adminAuditLog.action,
      actorId: adminAuditLog.actorId,
      actorName: owners.name,
      actorEmail: owners.email,
      targetTenantId: adminAuditLog.targetTenantId,
      targetTenantName: targetTenant.name,
      targetTenantSlug: targetTenant.slug,
      targetOwnerId: adminAuditLog.targetOwnerId,
      targetOwnerName: targetOwner.name,
      targetOwnerEmail: targetOwner.email,
      ipAddress: adminAuditLog.ipAddress,
      userAgent: adminAuditLog.userAgent,
      metadata: adminAuditLog.metadata,
      createdAt: adminAuditLog.createdAt,
    })
    .from(adminAuditLog)
    .leftJoin(owners, eq(owners.id, adminAuditLog.actorId))
    .leftJoin(targetTenant, eq(targetTenant.id, adminAuditLog.targetTenantId))
    .leftJoin(targetOwner, eq(targetOwner.id, adminAuditLog.targetOwnerId))
    .orderBy(desc(adminAuditLog.createdAt))
    .limit(pageSize)
    .offset(offset);

  const [countResult, rows] = await Promise.all([
    fullWhere ? baseFrom.where(fullWhere) : baseFrom,
    fullWhere ? baseData.where(fullWhere) : baseData,
  ]);

  const total = Number(countResult[0]?.c ?? 0);
  const totalPages = total === 0 ? 1 : Math.ceil(total / pageSize);

  const entries = rows.map((r) => {
    const actorName = r.actorName ?? null;
    const actorEmail = r.actorEmail ?? null;
    const targetTenantName = r.targetTenantName ?? null;
    const targetTenantSlug = r.targetTenantSlug ?? null;
    const targetOwnerName = r.targetOwnerName ?? null;
    const targetOwnerEmail = r.targetOwnerEmail ?? null;
    const targetLabel = formatAuditTargetLabel({
      targetTenantName,
      targetTenantSlug,
      targetOwnerName,
      targetOwnerEmail,
    });

    return {
      id: r.id,
      action: r.action,
      actionLabel: formatAuditActionLabel(r.action),
      actorId: r.actorId,
      actorName,
      actorEmail,
      actorLabel: formatAuditActorLabel({
        actorName,
        actorEmail,
        actorId: r.actorId,
      }),
      targetTenantId: r.targetTenantId,
      targetTenantName,
      targetTenantSlug,
      targetOwnerId: r.targetOwnerId,
      targetOwnerName,
      targetOwnerEmail,
      targetLabel,
      ipAddress: r.ipAddress,
      userAgent: r.userAgent,
      metadata: r.metadata ?? null,
      createdAt: r.createdAt.toISOString(),
    };
  });

  return c.json({ entries, total, page, pageSize, totalPages });
}
