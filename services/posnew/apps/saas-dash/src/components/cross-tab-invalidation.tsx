"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { subscribeQueryInvalidation } from "@/lib/session-cache-sync";

export function CrossTabInvalidationSubscriber() {
	const qc = useQueryClient();
	useEffect(() => {
		return subscribeQueryInvalidation((keys) => {
			for (const key of keys) {
				void qc.invalidateQueries({ queryKey: key });
			}
		});
	}, [qc]);
	return null;
}
