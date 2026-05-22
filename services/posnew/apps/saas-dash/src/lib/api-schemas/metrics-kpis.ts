import { z } from "zod";

/** Parsed owner KPI payload (`GET /metrics/kpis`). Kept permissive for forward-compatible fields. */
export const metricsKpisResponseSchema = z
	.object({
		success: z.boolean().optional(),
		data: z
			.object({
				range: z
					.object({
						since: z.string().optional(),
						until: z.string().optional(),
						rangeDays: z.number().optional(),
						source: z.string().optional(),
						windowDays: z.number().nullable().optional(),
					})
					.passthrough()
					.optional(),
				invoicesByStatusInRange: z.array(z.any()).optional(),
				topOrganizationsByProductEvents: z.array(z.any()).optional(),
				productEventsInRange: z.number().optional(),
				platformAuditsInRange: z.number().optional(),
				churnAndSeats: z.record(z.string(), z.unknown()).optional(),
			})
			.passthrough()
			.optional(),
	})
	.passthrough();

export type MetricsKpisParsed = z.infer<typeof metricsKpisResponseSchema>;
