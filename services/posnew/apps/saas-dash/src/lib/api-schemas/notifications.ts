import { z } from "zod";

export const notificationSchema = z.object({
	id: z.string(),
	severity: z.enum(["info", "warning", "critical"]),
	title: z.string(),
	body: z.string().nullable().optional(),
	href: z.string().nullable().optional(),
	createdAt: z.string(),
	isRead: z.boolean(),
});

export const notificationListResponseSchema = z.object({
	success: z.boolean(),
	data: z.array(notificationSchema),
});

export const notificationUnreadCountResponseSchema = z.object({
	success: z.boolean().optional(),
	count: z.number(),
});

export type Notification = z.infer<typeof notificationSchema>;
export type NotificationListParsed = z.infer<
	typeof notificationListResponseSchema
>;
export type NotificationUnreadCountParsed = z.infer<
	typeof notificationUnreadCountResponseSchema
>;
