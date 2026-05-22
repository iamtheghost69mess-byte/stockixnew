import { z } from "zod";

export const featureFlagSchema = z
	.object({
		_id: z.string(),
		key: z.string(),
		description: z.string().optional(),
		defaultEnabled: z.boolean(),
		killSwitch: z.boolean(),
		rolloutPercent: z.number(),
		orgOverrides: z.record(z.boolean()).optional(),
		updatedAt: z.string(),
	})
	.passthrough();

export const featureFlagListResponseSchema = z
	.object({
		success: z.boolean().optional(),
		data: z.array(featureFlagSchema).optional(),
	})
	.passthrough();

export type FeatureFlag = z.infer<typeof featureFlagSchema>;
export type FeatureFlagListParsed = z.infer<
	typeof featureFlagListResponseSchema
>;
