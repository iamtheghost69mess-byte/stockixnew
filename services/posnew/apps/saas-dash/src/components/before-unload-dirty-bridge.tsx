"use client";

import { useBeforeUnloadWhenDirty } from "@/hooks/use-before-unload-dirty";

export function BeforeUnloadDirtyBridge() {
	useBeforeUnloadWhenDirty();
	return null;
}
