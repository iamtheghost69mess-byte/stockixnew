import type { OwnerHealthLevel } from "@/components/owner/health-dot";

/**
 * Same coarse thresholds as `GET /organizations/health-summary` (4xx/5xx share of traffic).
 */
export function deriveOwnerHealthLevelFromStatusFamily(
	byStatus: Record<string, number> | undefined | null,
): OwnerHealthLevel {
	if (!byStatus || typeof byStatus !== "object") return "unknown";
	let total = 0;
	for (const v of Object.values(byStatus)) {
		total += Number(v) || 0;
	}
	if (total <= 0) return "ok";
	const s5 = Number(byStatus["5xx"]) || 0;
	const s4 = Number(byStatus["4xx"]) || 0;
	const rate5 = s5 / total;
	const rate4 = s4 / total;
	if (rate5 >= 0.1 || rate4 >= 0.4) return "down";
	if (rate5 >= 0.02 || rate4 >= 0.2) return "degraded";
	return "ok";
}
