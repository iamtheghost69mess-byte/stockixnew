import type { QueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/query-keys";
import { broadcastQueryInvalidation } from "@/lib/session-cache-sync";

const notificationQueryKeys: readonly (readonly unknown[])[] = [
	qk.notificationsFeed,
	qk.notificationsUnreadCount,
];

export function invalidateNotificationQueriesEverywhere(qc: QueryClient): void {
	for (const key of notificationQueryKeys) {
		void qc.invalidateQueries({ queryKey: key });
	}
	broadcastQueryInvalidation(notificationQueryKeys);
}
