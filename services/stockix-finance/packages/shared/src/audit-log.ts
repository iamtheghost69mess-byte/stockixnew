/** Machine action codes stored in `admin_audit_log.action`. */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "auth.login_success": "Signed in",
  "auth.login_failed": "Failed sign-in",
  "auth.password_reset_requested": "Password reset requested",
  "auth.password_reset_completed": "Password reset completed",
  "auth.mfa_enabled": "MFA enabled",
  "auth.mfa_disabled": "MFA disabled",
  "auth.mfa_failed": "Failed MFA verification",
  "owner.invite": "Owner invited",
  "owner.delete": "Owner removed",
  "owner.role_changed": "Owner role changed",
  "owner.status_changed": "Owner status changed",
  "owner.profile_updated": "Owner profile updated",
  "api_key.created": "API key created",
  "api_key.revoked": "API key revoked",
  "tenant.delete": "Tenant deleted",
  "tenant.update": "Tenant updated",
  "tenant.suspend": "Tenant suspended",
  "tenant.reactivate": "Tenant reactivated",
  "tenant.stop": "Tenant stopped",
  "tenant.impersonate": "Tenant impersonation",
  "tenant.retry_provision": "Provision retried",
  "org.created": "Organization created",
  "org.renamed": "Organization renamed",
  "org.suspended": "Organization suspended",
  "org.deleted": "Organization deleted",
  "org.access_granted": "Org access granted",
  "org.access_revoked": "Org access revoked",
  "plan.created": "Plan created",
  "plan.updated": "Plan updated",
  "plan.deactivated": "Plan deactivated",
  "license.generated": "License generated",
  "license.assigned": "License assigned",
  "license.extended": "License extended",
  "license.revoked": "License revoked",
  "license.auto_assigned_on_provision": "License auto-assigned on provision",
  "license.activation_deactivated": "License activation deactivated",
};

export function formatAuditActionLabel(action: string): string {
  const trimmed = action.trim();
  if (!trimmed) return "Unknown action";
  return AUDIT_ACTION_LABELS[trimmed] ?? trimmed.replaceAll(".", " · ").replaceAll("_", " ");
}

export function formatAuditActorLabel(input: {
  actorName?: string | null;
  actorEmail?: string | null;
  actorId?: string | null;
}): string {
  const name = input.actorName?.trim();
  const email = input.actorEmail?.trim();
  if (name && email) return `${name} (${email})`;
  if (email) return email;
  if (name) return name;
  if (input.actorId) return "Former user";
  return "Unknown";
}

export function formatAuditTargetLabel(input: {
  targetTenantName?: string | null;
  targetTenantSlug?: string | null;
  targetOwnerName?: string | null;
  targetOwnerEmail?: string | null;
}): string | null {
  const tenantName = input.targetTenantName?.trim();
  const tenantSlug = input.targetTenantSlug?.trim();
  if (tenantName || tenantSlug) {
    if (tenantName && tenantSlug && tenantName !== tenantSlug) {
      return `${tenantName} · ${tenantSlug}`;
    }
    return tenantName ?? tenantSlug ?? null;
  }
  const ownerName = input.targetOwnerName?.trim();
  const ownerEmail = input.targetOwnerEmail?.trim();
  if (ownerName || ownerEmail) {
    if (ownerName && ownerEmail) return `${ownerName} (${ownerEmail})`;
    return ownerName ?? ownerEmail ?? null;
  }
  return null;
}
