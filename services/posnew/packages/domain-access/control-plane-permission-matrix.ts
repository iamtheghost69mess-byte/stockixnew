export type ControlPlaneModuleAccessMatrix = {
	module: string;
	requiredAccessState: "active|expired|not_started" | "N/A";
	allowedActions: string;
};

export const controlPlanePermissionMatrix: readonly ControlPlaneModuleAccessMatrix[] =
	[
		{
			module: "organizations",
			requiredAccessState: "active|expired|not_started",
			allowedActions: "CRUD metadata",
		},
		{
			module: "users",
			requiredAccessState: "active|expired|not_started",
			allowedActions: "read/manage platform users",
		},
		{
			module: "jobs",
			requiredAccessState: "active|expired|not_started",
			allowedActions: "inspect/retry system jobs",
		},
		{
			module: "audits/logs",
			requiredAccessState: "active|expired|not_started",
			allowedActions: "read-only access",
		},
		{
			module: "webhooks/api-keys/flags/system",
			requiredAccessState: "active|expired|not_started",
			allowedActions: "control-plane operations",
		},
		{
			module: "inventory",
			requiredAccessState: "N/A",
			allowedActions: "NOT IN CONTROL PLANE",
		},
		{
			module: "billing",
			requiredAccessState: "N/A",
			allowedActions: "DISABLED / REMOVED",
		},
	] as const;
