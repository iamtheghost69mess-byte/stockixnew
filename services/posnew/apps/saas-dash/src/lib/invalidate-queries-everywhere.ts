import type { QueryClient } from "@tanstack/react-query";
import { invalidateAfterMutation, type MutationName } from "@/lib/query-keys";
import { broadcastQueryInvalidation } from "@/lib/session-cache-sync";

export function invalidateQueriesEverywhere(
	qc: QueryClient,
	name: MutationName,
): void {
	const keys = invalidateAfterMutation(name);
	for (const key of keys) {
		void qc.invalidateQueries({ queryKey: key });
	}
	broadcastQueryInvalidation(keys);
}
