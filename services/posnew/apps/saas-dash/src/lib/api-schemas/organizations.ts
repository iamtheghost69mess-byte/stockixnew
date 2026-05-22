import { z } from "zod";

export const organizationSchema = z
	.object({
		_id: z.string(),
		id: z.string().optional(),
		name: z.string().optional(),
		slug: z.string().optional(),
		ownerEmail: z.string().optional(),
		ownerName: z.string().optional(),
		country: z.string().optional(),
		city: z.string().optional(),
		timezone: z.string().optional(),
		isBootstrapped: z.boolean().optional(),
		initialAdminPinHint: z.string().optional(),
		defaultCredentials: z
			.array(
				z.object({
					role: z.string(),
					name: z.string().optional(),
					username: z.string().optional(),
					pin: z.string(),
				}),
			)
			.optional(),
		planKey: z.string().optional(),
		entitlements: z.record(z.any()).optional(),
		entitlementsSchemaVersion: z.number().optional(),
		createdAt: z.string().optional(),
		updatedAt: z.string().optional(),
		/** Mongo / JSON often sends `null` for unset license dates */
		licenseStartDate: z.union([z.string(), z.null()]).optional(),
		licenseEndDate: z.union([z.string(), z.null()]).optional(),
		licenseStartsAt: z.union([z.string(), z.null()]).optional(),
		licenseEndsAt: z.union([z.string(), z.null()]).optional(),
		accessState: z
			.object({
				status: z.enum(["active", "expired", "not_started"]),
				reason: z.string(),
				blocked: z.boolean(),
			})
			.optional(),
	})
	.passthrough();

export const organizationListResponseSchema = z
	.object({
		success: z.boolean().optional(),
		data: z.array(organizationSchema).optional(),
		nextCursor: z.string().nullable().optional(),
	})
	.passthrough();

export const organizationDetailResponseSchema = z
	.object({
		success: z.boolean().optional(),
		data: organizationSchema.optional(),
	})
	.passthrough();

const storageSliceSchema = z
	.object({
		approximateBytes: z.number(),
		documents: z.number(),
	})
	.passthrough();

const apiUsageWindowSchema = z
	.object({
		last24hUtcDays: z.array(z.string()),
		last7dUtcDays: z.array(z.string()),
		last30dUtcDays: z.array(z.string()),
		requests: z.object({
			last24h: z.number(),
			last7d: z.number(),
			last30d: z.number(),
		}),
		byStatusFamily: z.object({
			last24h: z.record(z.number()),
			last7d: z.record(z.number()),
			last30d: z.record(z.number()),
		}),
		topEndpoints: z.object({
			last24h: z.array(
				z.object({
					method: z.string(),
					endpointKey: z.string(),
					count: z.number(),
				}),
			),
			last7d: z.array(
				z.object({
					method: z.string(),
					endpointKey: z.string(),
					count: z.number(),
				}),
			),
			last30d: z.array(
				z.object({
					method: z.string(),
					endpointKey: z.string(),
					count: z.number(),
				}),
			),
		}),
	})
	.passthrough();

export const organizationObservabilityDataSchema = z
	.object({
		organizationId: z.string(),
		generatedAt: z.string(),
		apiUsage: z
			.object({
				windows: apiUsageWindowSchema,
				note: z.string().optional(),
			})
			.passthrough(),
		usageCountersSnapshot: z
			.object({
				ordersThisMonth: z.number().optional(),
				apiCallsThisMonth: z.number().optional(),
				usagePeriodYm: z.string().optional(),
			})
			.nullable()
			.optional(),
		storage: z
			.object({
				approximateTotalBytes: z.number(),
				note: z.string().optional(),
				byCollection: z.record(storageSliceSchema),
			})
			.passthrough(),
		entityCounts: z
			.object({
				users: z.number(),
				locations: z.number(),
				menuItems: z.number(),
				orders: z.number(),
				payments: z.number(),
			})
			.passthrough(),
	})
	.passthrough();

export const organizationObservabilityResponseSchema = z
	.object({
		success: z.boolean().optional(),
		data: organizationObservabilityDataSchema.optional(),
	})
	.passthrough();

export const organizationHealthSummaryRowSchema = z
	.object({
		organizationId: z.string(),
		usersCount: z.number(),
		totalRequests24h: z.number(),
		failedRequests24h: z.number(),
		healthLevel: z.enum(["ok", "degraded", "down"]),
		byStatusFamily: z.record(z.string(), z.number()).optional(),
	})
	.passthrough();

export const organizationHealthSummaryResponseSchema = z
	.object({
		success: z.boolean().optional(),
		data: z.array(organizationHealthSummaryRowSchema).optional(),
	})
	.passthrough();

export type Organization = z.infer<typeof organizationSchema>;
export type OrganizationListParsed = z.infer<
	typeof organizationListResponseSchema
>;
export type OrganizationDetailParsed = z.infer<
	typeof organizationDetailResponseSchema
>;
export type OrganizationObservabilityParsed = z.infer<
	typeof organizationObservabilityResponseSchema
>;
export type OrganizationObservabilityData = z.infer<
	typeof organizationObservabilityDataSchema
>;
export type OrganizationHealthSummaryRow = z.infer<
	typeof organizationHealthSummaryRowSchema
>;
