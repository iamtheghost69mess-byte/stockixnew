"use client";

import { useEffect } from "react";
import { hasDirtyForms } from "@/lib/dirty-form-registry";

export function useBeforeUnloadWhenDirty(): void {
	useEffect(() => {
		const onBeforeUnload = (e: BeforeUnloadEvent) => {
			if (!hasDirtyForms()) return;
			e.preventDefault();
			e.returnValue = "";
		};
		window.addEventListener("beforeunload", onBeforeUnload);
		return () => window.removeEventListener("beforeunload", onBeforeUnload);
	}, []);
}
