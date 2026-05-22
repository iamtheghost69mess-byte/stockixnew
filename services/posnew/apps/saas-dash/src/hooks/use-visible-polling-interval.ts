"use client";

import { useEffect, useState } from "react";

/**
 * Returns `intervalMs` while the document tab is visible, otherwise `false` (pauses TanStack refetch).
 */
export function useVisiblePollingInterval(intervalMs: number): number | false {
	const [visible, setVisible] = useState(true);

	useEffect(() => {
		const onVis = () => setVisible(document.visibilityState === "visible");
		onVis();
		document.addEventListener("visibilitychange", onVis);
		return () => document.removeEventListener("visibilitychange", onVis);
	}, []);

	return visible ? intervalMs : false;
}
