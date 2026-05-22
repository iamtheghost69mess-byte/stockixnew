"use client";

import { useEffect } from "react";

/**
 * Loads Sentry only when NEXT_PUBLIC_SENTRY_DSN is set. Does not send tokens; enable scrubbing in Sentry project
 * settings for extra safety.
 */
export function SentryClientInit() {
	useEffect(() => {
		const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
		if (!dsn) return;
		let cancelled = false;
		void import("@sentry/react").then((Sentry) => {
			if (cancelled) return;
			Sentry.init({
				dsn,
				environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
				tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1,
				beforeSend(event) {
					if (event.request?.headers) {
						delete event.request.headers["Authorization"];
					}
					return event;
				},
			});
		});
		return () => {
			cancelled = true;
		};
	}, []);
	return null;
}
