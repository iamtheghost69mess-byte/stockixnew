import { z } from "zod";

export const apiKeySchema = z
	.object({
		_id: z.string(),
		id: z.string().optional(),
		label: z.string().optional(),
		keyPrefix: z.string().optional(),
		lastUsedAt: z.string().nullable().optional(),
		createdAt: z.string().optional(),
	})
	.passthrough();

export const apiKeyListResponseSchema = z
	.object({
		success: z.boolean().optional(),
		data: z.array(apiKeySchema).optional(),
	})
	.passthrough();

export type ApiKey = z.infer<typeof apiKeySchema>;
export type ApiKeyListParsed = z.infer<typeof apiKeyListResponseSchema>;
