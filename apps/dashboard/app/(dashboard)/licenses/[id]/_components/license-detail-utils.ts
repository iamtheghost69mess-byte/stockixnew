export function productLabel(p: string): string {
  if (p === "pos_desktop") return "POS Desktop";
  if (p === "bundle") return "Bundle";
  return "Platform";
}

export type LicenseHistoryEntry = {
  id: string;
  licenseId: string;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  previousValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  notes: string | null;
  createdAt: string;
};

export function getActionVariant(
  action: string,
): "default" | "secondary" | "destructive" | "outline" {
  if (action === "revoked" || action === "expired_by_worker") return "destructive";
  if (action === "generated" || action === "assigned") return "default";
  if (action === "extended") return "secondary";
  return "outline";
}

export function formatHistoryAction(action: string): string {
  return action.replace(/_/g, " ");
}
