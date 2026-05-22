import {
	type DeviceRow,
	deviceListResponseSchema,
	deviceMutationResponseSchema,
	devicePendingCountResponseSchema,
} from "@/lib/api-schemas/devices";
import { parseApiResponse } from "@/lib/parse-api-response";
import { platformEndpoints } from "@/lib/platform-endpoints";
import { platformJson } from "@/lib/platform-http";

export type DeviceStatusFilter = "all" | "pending" | "approved" | "revoked";

export async function listDevices(params: {
	status?: DeviceStatusFilter;
	/** When omitted, lists devices across all organizations (platform aggregate). */
	organizationId?: string;
}): Promise<readonly DeviceRow[]> {
	const raw = await platformJson<unknown>(
		platformEndpoints.devices.list({
			status: params.status ?? "all",
			organizationId: params.organizationId,
		}),
	);
	const parsed = parseApiResponse(
		deviceListResponseSchema,
		raw,
		"devices list",
	);
	return parsed.data;
}

export async function getPendingDevicesCount(
	organizationId?: string,
): Promise<number> {
	const raw = await platformJson<unknown>(
		platformEndpoints.devices.pendingCount(organizationId),
	);
	const parsed = parseApiResponse(
		devicePendingCountResponseSchema,
		raw,
		"devices pending count",
	);
	return parsed.count;
}

async function patchDevice(path: string, body?: Record<string, unknown>) {
	const raw = await platformJson<unknown>(path, {
		method: "PATCH",
		headers: { "Content-Type": "application/json" },
		body: body ? JSON.stringify(body) : undefined,
	});
	return parseApiResponse(deviceMutationResponseSchema, raw, "device mutation");
}

export async function approveDevice(deviceId: string, organizationId: string) {
	return patchDevice(
		platformEndpoints.devices.approve(deviceId, organizationId),
	);
}

export async function revokeDevice(deviceId: string, organizationId: string) {
	return patchDevice(
		platformEndpoints.devices.revoke(deviceId, organizationId),
	);
}

export async function updateDeviceNickname(
	deviceId: string,
	organizationId: string,
	nickname: string,
) {
	return patchDevice(
		platformEndpoints.devices.nickname(deviceId, organizationId),
		{
			nickname,
		},
	);
}

export async function deleteDevice(deviceId: string, organizationId: string) {
	const raw = await platformJson<unknown>(
		platformEndpoints.devices.remove(deviceId, organizationId),
		{
			method: "DELETE",
		},
	);
	return parseApiResponse(deviceMutationResponseSchema, raw, "device delete");
}
