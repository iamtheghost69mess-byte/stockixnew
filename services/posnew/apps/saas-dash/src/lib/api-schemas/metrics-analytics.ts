import { z } from "zod";

export const metricsAnalyticsResponseSchema = z
	.object({
		success: z.boolean().optional(),
		data: z
			.object({
				from: z.string().optional(),
				to: z.string().optional(),
				series: z
					.array(
						z.object({
							dayUtc: z.string(),
							events: z.number(),
						}),
					)
					.optional(),
				totalRollupEvents: z.number().optional(),
				rollupRowCount: z.number().optional(),
			})
			.passthrough()
			.optional(),
	})
	.passthrough();

export type MetricsAnalyticsParsed = z.infer<
	typeof metricsAnalyticsResponseSchema
>;
