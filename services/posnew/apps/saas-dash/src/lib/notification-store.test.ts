import { beforeEach, describe, expect, it } from "vitest";
import { useNotificationStore } from "@/lib/notification-store";

describe("useNotificationStore", () => {
	beforeEach(() => {
		useNotificationStore.setState({ unreadCount: 0 });
	});

	it("stores unread count from server refresh", () => {
		useNotificationStore.getState().setUnreadCount(5);
		expect(useNotificationStore.getState().unreadCount).toBe(5);
	});

	it("allows reset to zero after mark-all-read", () => {
		useNotificationStore.getState().setUnreadCount(9);
		useNotificationStore.getState().setUnreadCount(0);
		expect(useNotificationStore.getState().unreadCount).toBe(0);
	});
});
