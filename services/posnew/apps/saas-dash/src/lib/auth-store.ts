"use client";

import { create } from "zustand";
import {
	platformLogout,
	requestTokenRefresh,
	savePlatformRefreshToken,
	savePlatformToken,
} from "@/lib/platform-public-http";
import { singleFlightRefresh } from "@/lib/refresh-mutex";
import { broadcastLogout, subscribeSessionSync } from "@/lib/session-sync";

export type PlatformUser = {
	id?: string;
	_id?: string;
	email?: string;
	roles?: string[];
	apiScopes?: string[];
	[k: string]: unknown;
};

type AuthState = {
	user: PlatformUser | null;
	sessionExpiredOpen: boolean;
	setSession: (user: PlatformUser) => void;
	/** Access token removed; refresh token handled by cookies. */
	openSessionExpired: () => void;
	closeSessionExpired: () => void;
	logout: (opts?: {
		sessionExpired?: boolean;
		skipServerLogout?: boolean;
		skipBroadcast?: boolean;
	}) => void;
	/** Restore user session on page load. */
	bootstrapSession: () => Promise<boolean>;
	/** Trigger refresh on backend (handles cookies). */
	refreshSession: () => Promise<boolean>;
	fetchMe: () => Promise<void>;
};

async function postRefresh(): Promise<boolean> {
	return singleFlightRefresh(async () => {
		const r = await requestTokenRefresh("");
		if (r.ok) {
			if (r.accessToken) savePlatformToken(r.accessToken);
			if (r.refreshToken) savePlatformRefreshToken(r.refreshToken);
		}
		return r.ok;
	});
}

export const useAuthStore = create<AuthState>((set, get) => ({
	user: null,
	sessionExpiredOpen: false,
	setSession: (user) => {
		set({ user, sessionExpiredOpen: false });
	},
	openSessionExpired: () => set({ sessionExpiredOpen: true }),
	closeSessionExpired: () => set({ sessionExpiredOpen: false }),
	logout: (opts) => {
		set({
			user: null,
			sessionExpiredOpen: Boolean(opts?.sessionExpired),
		});
		savePlatformToken(undefined); // Clear dev-only fallback access token
		savePlatformRefreshToken(undefined); // Clear dev-only fallback refresh token
		if (!opts?.skipServerLogout) {
			void platformLogout().catch(() => {
				/* ignore network/logout endpoint failures during local sign-out */
			});
		}
		if (!opts?.skipBroadcast) {
			broadcastLogout();
		}
		// Note: Backend should clear cookies on a separate /logout endpoint if needed.
		// Dashboard can just clear state for now.
	},
	bootstrapSession: async () => {
		const ok = await postRefresh();
		if (!ok) return false;
		await get().fetchMe();
		return Boolean(get().user);
	},
	refreshSession: async () => {
		const ok = await postRefresh();
		if (!ok) return false;
		await get().fetchMe();
		return true;
	},
	fetchMe: async () => {
		try {
			const { platformJson } = await import("@/lib/platform-http");
			const json = await platformJson<{ data?: { user?: PlatformUser } }>(
				"/auth/me",
			);
			if (json?.data?.user) set({ user: json.data.user });
		} catch {
			/* ignore */
		}
	},
}));

if (typeof window !== "undefined") {
	subscribeSessionSync(
		() => {
			useAuthStore.getState().logout({
				skipBroadcast: true,
				skipServerLogout: true,
			});
		},
		(_unusedAccessToken) => {
			// With cookies, cross-tab sync of raw tokens is no longer necessary.
			// But we might want to trigger a 'me' fetch if another tab logged in.
			useAuthStore.getState().fetchMe();
		},
	);
}
