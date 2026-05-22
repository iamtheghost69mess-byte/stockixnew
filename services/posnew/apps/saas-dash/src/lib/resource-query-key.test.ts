import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { qk } from "@/lib/query-keys";
import { ResourceRegistry } from "@/lib/resource-config";
import { buildResourceListQueryKey } from "@/lib/resource-query-key";

describe("buildResourceListQueryKey", () => {
	it("uses resource id when queryKeyBase is absent", () => {
		const key = buildResourceListQueryKey(
			{ id: "jobs", queryKeyBase: undefined },
			{
				search: "",
				queryParams: {},
			},
		);
		expect(key).toEqual(["jobs", { search: "", queryParams: {} }]);
	});

	it("prefixes flags list with qk.flags so invalidation matches", () => {
		const key = buildResourceListQueryKey(ResourceRegistry.flags, {
			search: "",
			queryParams: {},
		});
		expect(key[0]).toBe("platform");
		expect(key[1]).toBe("flags");
		expect(key[2]).toEqual({ search: "", queryParams: {} });
	});

	it("invalidating qk.flags marks flags ResourcePage query stale", () => {
		const qc = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const key = buildResourceListQueryKey(ResourceRegistry.flags, {
			search: "x",
			queryParams: { a: 1 },
		});
		qc.setQueryData(key, []);
		void qc.invalidateQueries({ queryKey: [...qk.flags] });
		expect(qc.getQueryState(key)?.isInvalidated).toBe(true);
	});

	it("prefixes audits with platform audits root for SSE alignment", () => {
		const key = buildResourceListQueryKey(ResourceRegistry.audits, {
			search: "",
			queryParams: { organizationId: "507f1f77bcf86cd799439011" },
		});
		expect(key.slice(0, 2)).toEqual(["platform", "audits"]);
	});

	it("includes page cursor in tail for cursor-paginated resources", () => {
		const key = buildResourceListQueryKey(ResourceRegistry.organizations, {
			search: "",
			queryParams: {},
			pageCursor: "abc",
		});
		expect(key[2]).toMatchObject({ pageCursor: "abc" });
	});
});
