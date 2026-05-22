import { z } from "zod";

export const webhookEndpointSchema = z
	.object({
		_id: z.string(),
		organization: z.string().optional(),
		organizationId: z.string().optional(),
		url: z.string().optional(),
		description: z.string().optional(),
		disabled: z.boolean().optional(),
		eventTypes: z.array(z.string()).optional(),
		createdAt: z.string().optional(),
		updatedAt: z.string().optional(),
	})
	.passthrough();

export const webhookListResponseSchema = z
	.object({
		success: z.boolean().optional(),
		data: z.array(webhookEndpointSchema).optional(),
	})
	.passthrough();

export const webhookOutboxRowSchema = z
	.object({
		_id: z.string(),
		organization: z.string().optional(),
		endpoint: z.string().optional(),
		eventType: z.string().optional(),
		status: z.string().optional(),
		attemptCount: z.number().optional(),
		lastError: z.string().optional(),
		payloadPreview: z.string().optional(),
		idempotencyKey: z.string().optional(),
		createdAt: z.string().optional(),
		updatedAt: z.string().optional(),
	})
	.passthrough();

export const webhookOutboxListResponseSchema = z
	.object({
		success: z.boolean().optional(),
		data: z.array(webhookOutboxRowSchema).optional(),
	})
	.passthrough();

export type WebhookEndpoint = z.infer<typeof webhookEndpointSchema>;
export type WebhookListParsed = z.infer<typeof webhookListResponseSchema>;
export type WebhookOutboxListParsed = z.infer<
	typeof webhookOutboxListResponseSchema
>;
