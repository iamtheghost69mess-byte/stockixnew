const CODE_MESSAGES: Record<string, string> = {
  LICENSE_EXPIRED: "This tenant's license has expired. Renew or assign a new license before continuing.",
  NO_ACTIVE_LICENSE: "Assign an active license to this tenant before continuing.",
  PLAN_LIMIT_REACHED: "This tenant has reached the maximum number of organizations allowed by its plan or license.",
  tenant_not_found: "That tenant no longer exists.",
  tenant_not_active:
    "This tenant cannot be suspended right now (still provisioning, failed, or already stopped). Refresh the page and check its status.",
  tenant_busy: "This tenant is busy (provisioning or active). Stop provisioning or suspend it first.",
  forbidden_actor: "You do not have permission to perform this action.",
  forbidden_role: "Your role does not allow this action.",
  unauthorized_actor: "You need to sign in again.",
  unauthorized: "You need to sign in again.",
  csrf_violation: "This action could not be verified. Refresh the page and try again.",
  already_enabled: "Multi-factor authentication is already enabled for this account.",
  setup_expired: "MFA setup expired or was reset. Start setup again.",
  not_enabled: "MFA is not enabled, so it cannot be disabled.",
  "Invalid MFA code": "The authenticator code did not match. Try again.",
  invalid_body: "The request could not be processed. Check the form and try again.",
  organization_not_found: "That organization was not found.",
  CANNOT_SUSPEND_PRIMARY: "The primary organization cannot be suspended. Suspend the tenant or remove child organizations first.",
  CANNOT_DELETE_PRIMARY: "The primary organization cannot be deleted. Delete the tenant instead.",
  license_already_assigned: "This license is already assigned to a tenant.",
  no_fields_to_update: "No changes were sent.",
  mfa_required: "Enter your authenticator code to continue.",
  organization_access_denied:
    "You are not assigned to manage this organization for this tenant. Ask a super admin to adjust your access scope.",
  organization_access_create_denied:
    "Your account is scoped to specific organizations on this tenant. Only a super admin may create additional organizations.",
  organization_access_exists: "This access grant already exists.",
  organization_access_not_found: "That access grant was not found.",
  owner_must_be_support_agent: "Only support agent accounts can receive organization-scoped access.",
  owner_not_found: "That team member was not found.",
  email_already_exists: "An owner with that email already exists.",
};

function errorCode(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  if (!("error" in body)) return null;
  const e = (body as { error: unknown }).error;
  return typeof e === "string" ? e : null;
}

function errorMessage(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  if (!("message" in body)) return null;
  const m = (body as { message: unknown }).message;
  if (typeof m !== "string") return null;
  const t = m.trim();
  return t.length > 0 ? t : null;
}

/** Human-friendly message when the API returns `{ error?: string, message?: string }`. */
export function formatApiError(body: unknown, fallback: string): string {
  const code = errorCode(body);
  if (code && CODE_MESSAGES[code]) return CODE_MESSAGES[code];
  const msg = errorMessage(body);
  if (msg) return msg;
  if (code) return code.replace(/_/g, " ");
  return fallback;
}
