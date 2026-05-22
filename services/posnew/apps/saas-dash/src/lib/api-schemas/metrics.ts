import { z } from "zod";

export const metricsSummaryResponseSchema = z
	.object({
		success: z.boolean().optional(),
		data: z
			.object({
				organizations: z.number().optional(),
				productEvents24h: z.number().optional(),
				platformAudits24h: z.number().optional(),
				productEventRollupSeries7d: z
					.array(
						z.object({
							dayUtc: z.string(),
							events: z.number(),
						}),
					)
					.optional(),
				productEventRollupEvents7d: z.number().optional(),
				slo: z
					.object({
						availabilityTarget: z.number().optional(),
						observedErrorBudgetRatio: z.number().optional(),
					})
					.optional(),
			})
			.passthrough()
			.optional(),
	})
	.passthrough();

export type MetricsSummaryParsed = z.infer<typeof metricsSummaryResponseSchema>;
