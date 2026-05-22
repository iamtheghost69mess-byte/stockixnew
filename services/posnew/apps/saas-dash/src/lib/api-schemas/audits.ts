import { z } from "zod";

export const auditSchema = z
	.object({
		_id: z.string(),
		action: z.string().optional(),
		organization: z.coerce.string().nullable().optional(),
		actorPlatformUser: z.coerce.string().nullable().optional(),
		metadata: z.record(z.any()).nullable().optional(),
		requestId: z.string().nullable().optional(),
		createdAt: z.string().optional(),
	})
	.passthrough();

export const auditListResponseSchema = z
	.object({
		success: z.boolean().optional(),
		data: z.array(auditSchema).optional(),
		nextCursor: z.string().nullable().optional(),
	})
	.passthrough();

export type Audit = z.infer<typeof auditSchema>;
export type AuditListParsed = z.infer<typeof auditListResponseSchema>;
