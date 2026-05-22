import * as z from "zod";

/** Schema for a platform organization association within a user record. */
export const platformUserOrgSchema = z.object({
	_id: z.string(),
	name: z.string().optional(),
	status: z.string().optional(),
});

/** Schema for a single Global User record. */
export const platformGlobalUserSchema = z.object({
	_id: z.string(),
	email: z.string().email().optional().nullable(),
	name: z.string().optional(),
	role: z.string().optional(),
	status: z.enum(["active", "suspended"]).optional(),
	organization: platformUserOrgSchema.optional().nullable(),
	location: z
		.object({ _id: z.string(), name: z.string() })
		.optional()
		.nullable(),
	createdAt: z.string().optional(),
	updatedAt: z.string().optional(),
});

/** Schema for the global users list response. */
export const platformGlobalUserListResponseSchema = z.object({
	success: z.boolean(),
	data: z.object({
		users: z.array(platformGlobalUserSchema),
		total: z.number(),
	}),
});

/** Schema for a single user detail response. */
export const platformGlobalUserDetailResponseSchema = z.object({
	success: z.boolean(),
	data: platformGlobalUserSchema,
});
