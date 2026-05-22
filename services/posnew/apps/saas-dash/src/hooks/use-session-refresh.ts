"use client";

import { useEffect, useRef } from "react";
import { useAuthStore } from "@/lib/auth-store";

const DEBOUNCE_MS = 2000;

/** Refetch `/auth/me` when the tab becomes visible or the window gains focus (debounced). */
export function useSessionRefresh(enabled: boolean): void {
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		if (!enabled) return;

		const schedule = () => {
			if (timerRef.current) clearTimeout(timerRef.current);
			timerRef.current = setTimeout(() => {
				timerRef.current = null;
				void useAuthStore.getState().fetchMe();
			}, DEBOUNCE_MS);
		};

		const onVisibility = () => {
			if (document.visibilityState === "visible") schedule();
		};

		window.addEventListener("focus", schedule);
		document.addEventListener("visibilitychange", onVisibility);

		return () => {
			window.removeEventListener("focus", schedule);
			document.removeEventListener("visibilitychange", onVisibility);
			if (timerRef.current) clearTimeout(timerRef.current);
		};
	}, [enabled]);
}
