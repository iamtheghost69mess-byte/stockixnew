export type OrganizationAccessState = {
  status: "active" | "expired" | "not_started";
  reason: string;
  blocked: boolean;
};

export type OrganizationAccessInput = {
  licenseStartDate?: string | Date | null;
  licenseEndDate?: string | Date | null;
  timezone?: string | null;
  now?: Date;
};

export declare function getOrganizationAccessState(
  input: OrganizationAccessInput
): OrganizationAccessState;

export type ControlPlaneModuleAccessMatrix = {
  module: string;
  requiredAccessState: "active|expired|not_started" | "N/A";
  allowedActions: string;
};

export declare const controlPlanePermissionMatrix: readonly ControlPlaneModuleAccessMatrix[];
