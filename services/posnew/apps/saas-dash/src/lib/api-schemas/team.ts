import * as z from "zod";

export const orgInvitationSchema = z.object({
	_id: z.string(),
	email: z.string(),
	roleHint: z.string(),
	organization: z.object({
		_id: z.string(),
		name: z.string(),
		slug: z.string(),
	}),
	expiresAt: z.string(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

export const orgInvitationListResponseSchema = z.object({
	success: z.boolean(),
	data: z.array(orgInvitationSchema),
	nextCursor: z.string().optional().nullable(),
});

export type OrgInvitation = z.infer<typeof orgInvitationSchema>;
