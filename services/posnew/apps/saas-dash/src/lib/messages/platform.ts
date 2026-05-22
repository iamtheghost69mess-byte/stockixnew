export type MessageParams = Record<string, string | number | undefined>;

const catalog: Record<string, string | ((p: MessageParams) => string)> = {
	"auth.invalid": "Invalid email or password.",
	"auth.sessionExpired": "Your session has expired. Sign in again to continue.",
	"auth.refreshReuse":
		"Your session was invalidated for security. Please sign in again.",
	"rate.limited": (p) =>
		`Too many requests. Retry in ${p.seconds != null ? String(p.seconds) : "a few"}s.`,
	"network.error": "Network error. Check your connection and try again.",
	"error.generic": "Something went wrong.",
	"org.slugConflict": "That slug is already in use.",
	"validation.failed": "Please fix the highlighted fields.",
};

export function platformMessage(key: string, params?: MessageParams): string {
	const entry = catalog[key];
	if (typeof entry === "function") return entry(params || {});
	if (typeof entry === "string") return entry;
	return key;
}

export function mapErrorCode(status: number, bodyCode?: string): string {
	if (bodyCode === "PLATFORM_REFRESH_REUSE") return "auth.refreshReuse";
	if (status === 401) return "auth.sessionExpired";
	if (status === 429) return "rate.limited";
	return "error.generic";
}
