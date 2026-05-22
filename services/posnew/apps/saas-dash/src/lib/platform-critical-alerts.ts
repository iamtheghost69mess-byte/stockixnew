/**
 * Maps platform audit `action` strings (from SSE / audit log) to in-app alert levels.
 * Keep in sync with `writeAudit` calls under `apps/pos-backend/controllers/platform*`.
 */
export type PlatformAuditAlertLevel = "info" | "warning" | "critical";

const CRITICAL_ACTIONS = new Set<string>([
	"platform.org.delete",
	"platform.compliance.deletion_scheduled",
]);

const WARNING_PREFIXES = [
	"platform.impersonation.",
	"platform.org.lifecycle",
	"platform.org.entitlements",
	"platform.org.provisioning_retry",
	"platform.org.credential_role_pin_reset",
	"platform.refresh.reuse_suspected",
	"platform.api_key.revoke",
	"platform.webhook_endpoint.revoke",
	"platform.compliance.export_requested",
	"platform.job.retry",
];

export function classifyPlatformAuditAction(
	action: string,
): PlatformAuditAlertLevel {
	const a = String(action || "").trim();
	if (!a) return "info";
	if (CRITICAL_ACTIONS.has(a)) return "critical";
	if (WARNING_PREFIXES.some((p) => a.startsWith(p))) return "warning";
	return "info";
}
