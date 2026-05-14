export type AuditLogEntry = {
  id: string;
  action: string;
  actorId: string;
  actorName: string;
  targetTenantId: string | null;
  targetOwnerId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};
