import type { PlatformHttpError } from "@/lib/platform-public-http";

export function mutationErrorMessage(err: unknown, fallback: string): string {
	const e = err as Partial<PlatformHttpError>;
	if (typeof e?.message === "string" && e.message.length > 0) return e.message;
	return fallback;
}
