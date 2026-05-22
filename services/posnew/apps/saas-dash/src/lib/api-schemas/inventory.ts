import * as z from "zod";

/** Schema for low stock alerts. */
export const platformInventoryLowStockSchema = z.object({
	_id: z.string(),
	name: z.string(),
	currentStock: z.number(),
	reorderThreshold: z.number(),
	unit: z.string().optional().default("pcs"),
});

/** Schema for slow moving stock. */
export const platformInventorySlowMovingSchema = z.object({
	_id: z.string(),
	name: z.string(),
	currentStock: z.number(),
	totalDeductedAmount: z.number().optional().default(0),
	unit: z.string().optional().default("pcs"),
});

/** Schema for a single stock movement record. */
export const platformInventoryMovementSchema = z.object({
	_id: z.string(),
	createdAt: z.string(),
	delta: z.number(),
	reason: z.string(),
	ingredient: z.object({ name: z.string() }).optional().nullable(),
	user: z.object({ name: z.string() }).optional().nullable(),
});

/** Response schema for low stock alerts list. */
export const platformInventoryLowStockResponseSchema = z.object({
	success: z.boolean(),
	data: z.array(platformInventoryLowStockSchema),
});

/** Response schema for slow moving stock list. */
export const platformInventorySlowMovingResponseSchema = z.object({
	success: z.boolean(),
	data: z.array(platformInventorySlowMovingSchema),
});

/** Response schema for the movements feed. */
export const platformInventoryMovementsResponseSchema = z.object({
	success: z.boolean(),
	data: z.array(platformInventoryMovementSchema),
});
