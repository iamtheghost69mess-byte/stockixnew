import { z } from "zod";

const RESERVED_ORG_SLUGS = new Set([
	"admin",
	"api",
	"app",
	"assets",
	"auth",
	"blog",
	"cdn",
	"dashboard",
	"dev",
	"docs",
	"files",
	"ftp",
	"help",
	"imap",
	"internal",
	"localhost",
	"login",
	"logout",
	"mail",
	"platform",
	"pop",
	"prod",
	"root",
	"signin",
	"signup",
	"smtp",
	"staging",
	"static",
	"status",
	"support",
	"system",
	"test",
	"uploads",
	"www",
]);

export const organizationCreateSchema = z
	.object({
		name: z.string().min(1, "Name required"),
		slug: z
			.string()
			.min(2)
			.max(63)
			.regex(
				/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/,
				"Lowercase letters, numbers, hyphen (no leading/trailing hyphen)",
			),
		planKey: z.string().optional(),
		ownerEmail: z.union([z.string().email(), z.literal("")]).optional(),
		ownerName: z.string().optional(),
		country: z.string().optional(),
		city: z.string().optional(),
		timezone: z.string().default("Asia/Beirut"),
		maxLocations: z.number().int().min(1).max(999).optional(),
		maxUsers: z.number().int().min(1).max(99_999).optional(),
		licenseStartDate: z.string().optional(),
		licenseEndDate: z.string().optional(),
	})
	.superRefine((val, ctx) => {
		const slug = String(val.slug || "").trim().toLowerCase();
		if (RESERVED_ORG_SLUGS.has(slug)) {
			ctx.addIssue({
				code: "custom",
				message: "This tenant subdomain is reserved.",
				path: ["slug"],
			});
		}
		const start = val.licenseStartDate;
		const end = val.licenseEndDate;
		if (start && end) {
			const a = new Date(start);
			const b = new Date(end);
			if (!Number.isNaN(a.getTime()) && !Number.isNaN(b.getTime()) && b < a) {
				ctx.addIssue({
					code: "custom",
					message: "License end must be on or after license start.",
					path: ["licenseEndDate"],
				});
			}
		}
	});

export type OrganizationCreateInput = z.infer<typeof organizationCreateSchema>;
