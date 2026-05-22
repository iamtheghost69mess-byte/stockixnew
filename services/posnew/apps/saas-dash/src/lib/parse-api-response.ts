import type { ZodType } from "zod";
import type { PlatformHttpError } from "@/lib/platform-public-http";

export function parseApiResponse<T>(
	schema: ZodType<T>,
	data: unknown,
	label: string,
): T {
	const r = schema.safeParse(data);
	if (!r.success) {
		const message = `The server returned an unexpected ${label} shape. Please retry or contact support.`;
		const err = new Error(message) as Error & PlatformHttpError;
		err.status = 502;
		err.code = "error.generic";
		err.raw = r.error.flatten();
		throw err;
	}
	return r.data;
}
