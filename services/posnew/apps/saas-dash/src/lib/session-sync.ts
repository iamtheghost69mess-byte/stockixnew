const CH = "platform-saas-session";

export type SessionBroadcast =
	| { type: "logout" }
	/** Access token only — refresh stays in sessionStorage (written by the tab that rotated). */
	| { type: "tokens"; accessToken: string };

function channel(): BroadcastChannel | null {
	if (typeof BroadcastChannel === "undefined") return null;
	try {
		return new BroadcastChannel(CH);
	} catch {
		return null;
	}
}

export function broadcastLogout(): void {
	const bc = channel();
	if (!bc) return;
	bc.postMessage({ type: "logout" } satisfies SessionBroadcast);
	bc.close();
}

export function broadcastAccessToken(accessToken: string): void {
	const bc = channel();
	if (!bc) return;
	bc.postMessage({ type: "tokens", accessToken } satisfies SessionBroadcast);
	bc.close();
}

export function subscribeSessionSync(
	onLogout: () => void,
	onAccessToken: (accessToken: string) => void,
): () => void {
	const bc = channel();
	if (!bc) return () => {};
	bc.onmessage = (ev: MessageEvent<SessionBroadcast>) => {
		const m = ev.data;
		if (m?.type === "logout") onLogout();
		if (m?.type === "tokens" && typeof m.accessToken === "string") {
			onAccessToken(m.accessToken);
		}
	};
	return () => {
		bc.close();
	};
}
