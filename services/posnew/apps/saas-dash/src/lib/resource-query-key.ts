import type { ResourceDefinition } from "@/lib/resource-config";

/** Third segment of {@link ResourcePage} list query keys (search, API filters, paging). */
export type ResourcePageQueryTail = {
	readonly search: string;
	readonly queryParams: Record<string, string | number | boolean | undefined>;
	readonly pageCursor?: string | null;
	readonly pageOffset?: number;
};

/**
 * Stable TanStack Query key for {@link ResourcePage} list fetches.
 * Prefix must align with mutation/SSE invalidation (e.g. `qk.flags`, `qk.auditsListRoot`).
 */
export function buildResourceListQueryKey(
	resource: Pick<ResourceDefinition, "id" | "queryKeyBase">,
	tail: ResourcePageQueryTail,
): readonly unknown[] {
	const base = resource.queryKeyBase ?? [resource.id];
	return [...base, tail];
}
