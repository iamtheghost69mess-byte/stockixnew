import { z } from "zod";

export const jobSchema = z
	.object({
		id: z.string().optional(),
		state: z.string().optional(),
		progress: z.union([z.number(), z.record(z.any())]).optional(),
		finishedOn: z.number().optional(),
		processedOn: z.number().optional(),
		failedReason: z.string().optional(),
		returnvalue: z.any().optional(),
		timestamp: z.number().optional(),
		attemptsMade: z.number().optional(),
		name: z.string().optional(),
		data: z.record(z.any()).optional(),
		opts: z.record(z.any()).optional(),
	})
	.passthrough();

export const jobDetailResponseSchema = z
	.object({
		success: z.boolean().optional(),
		data: jobSchema.optional(),
	})
	.passthrough();

export const jobListResponseSchema = z
	.object({
		success: z.boolean().optional(),
		data: z.array(jobSchema).optional(),
		metadata: z
			.object({
				offset: z.number().optional(),
				limit: z.number().optional(),
				approximateTotalFetched: z.number().optional(),
			})
			.optional(),
	})
	.passthrough();

export type Job = z.infer<typeof jobSchema>;
export type JobDetailParsed = z.infer<typeof jobDetailResponseSchema>;
export type JobListParsed = z.infer<typeof jobListResponseSchema>;
