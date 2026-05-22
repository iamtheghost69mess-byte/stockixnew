"use client";

import { create } from "zustand";

type State = {
	unreadCount: number;
	setUnreadCount: (c: number) => void;
};

export const useNotificationStore = create<State>((set) => ({
	unreadCount: 0,
	setUnreadCount: (c) => set({ unreadCount: c }),
	// Read state is server-authoritative; store is only for local badge rendering.
}));
