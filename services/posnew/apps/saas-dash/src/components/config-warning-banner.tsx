"use client";

import { useEffect, useState } from "react";

/** Blocks interaction when the platform API origin is missing in production builds. */
export function ConfigWarningBanner() {
	const [show, setShow] = useState(false);

	useEffect(() => {
		const origin =
			process.env.NEXT_PUBLIC_POS_API_ORIGIN?.replace(/\/$/, "") || "";
		setShow(process.env.NODE_ENV === "production" && !origin);
	}, []);

	if (!show) return null;

	return (
		<div
			role="alert"
			className="border-b border-destructive/50 bg-destructive/15 px-4 py-3 text-center text-sm text-destructive"
		>
			<strong>Configuration error:</strong>{" "}
			<code className="rounded bg-muted px-1">NEXT_PUBLIC_POS_API_ORIGIN</code>{" "}
			is required in production. Set it to your POS / platform API base (no
			trailing slash), then redeploy.
		</div>
	);
}
