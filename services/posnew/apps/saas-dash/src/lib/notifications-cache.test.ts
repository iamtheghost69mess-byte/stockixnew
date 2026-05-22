import { beforeEach, describe, expect, it, vi } from "vitest";
import { qk } from "@/lib/query-keys";

const { broadcastQueryInvalidationMock } = vi.hoisted(() => ({
	broadcastQueryInvalidationMock: vi.fn(),
}));

vi.mock("@/lib/session-cache-sync", () => ({
	broadcastQueryInvalidation: broadcastQueryInvalidationMock,
}));

import { invalidateNotificationQueriesEverywhere } from "@/lib/notifications-cache";

describe("invalidateNotificationQueriesEverywhere", () => {
	beforeEach(() => {
		broadcastQueryInvalidationMock.mockClear();
	});

	it("invalidates feed + unread count and broadcasts same keys", () => {
		const invalidateQueries = vi.fn();
		const queryClient = { invalidateQueries } as unknown as Parameters<
			typeof invalidateNotificationQueriesEverywhere
		>[0];

		invalidateNotificationQueriesEverywhere(queryClient);

		expect(invalidateQueries).toHaveBeenNthCalledWith(1, {
			queryKey: qk.notificationsFeed,
		});
		expect(invalidateQueries).toHaveBeenNthCalledWith(2, {
			queryKey: qk.notificationsUnreadCount,
		});
		expect(broadcastQueryInvalidationMock).toHaveBeenCalledWith([
			qk.notificationsFeed,
			qk.notificationsUnreadCount,
		]);
	});
});
