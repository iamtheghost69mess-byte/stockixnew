import { z } from "zod";

export const deviceSchema = z.object({
	_id: z.string(),
	uuid: z.string(),
	nickname: z.string().nullable().optional(),
	status: z.enum(["pending", "approved", "revoked"]),
	createdAt: z.string(),
	lastSeenAt: z.string().nullable().optional(),
	organization: z.string().optional(),
});

export const deviceListResponseSchema = z.object({
	success: z.boolean(),
	data: z.array(deviceSchema),
});

export const devicePendingCountResponseSchema = z.object({
	success: z.boolean().optional(),
	count: z.number(),
});

export const deviceMutationResponseSchema = z.object({
	success: z.boolean(),
	message: z.string().optional(),
	data: deviceSchema.optional(),
});

export type DeviceRow = z.infer<typeof deviceSchema>;
