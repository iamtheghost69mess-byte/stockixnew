"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import type { PlatformHttpError } from "@/lib/platform-http";

const COOLDOWN_MS = 8_000;

/** One generic toast per query key on hard failures; skips auth errors and opt-out meta. */
export function QueryErrorListener() {
	const qc = useQueryClient();
	const lastToastAt = useRef<Map<string, number>>(new Map());

	useEffect(() => {
		return qc.getQueryCache().subscribe((event) => {
			if (event.type !== "updated") return;
			if (event.action.type !== "error") return;
			const q = event.query;
			const meta = q.meta as { skipGlobalErrorToast?: boolean } | undefined;
			if (meta?.skipGlobalErrorToast) return;
			const err = event.action.error as PlatformHttpError & Error;
			const st = typeof err?.status === "number" ? err.status : undefined;
			if (st === 401 || st === 403) return;

			const key = q.queryHash;
			const now = Date.now();
			const prev = lastToastAt.current.get(key) ?? 0;
			if (now - prev < COOLDOWN_MS) return;
			lastToastAt.current.set(key, now);

			const pe = err as PlatformHttpError;
			const msg =
				typeof err?.message === "string" &&
				err.message.length > 0 &&
				err.message.length < 200
					? err.message
					: "Something went wrong loading data.";
			if (pe?.code === "rate.limited" && typeof pe.retryAfterSec === "number") {
				toast.error(msg, {
					duration: Math.min(
						120_000,
						Math.max(4000, (pe.retryAfterSec + 1) * 1000),
					),
				});
				return;
			}
			toast.error(msg);
		});
	}, [qc]);

	return null;
}
