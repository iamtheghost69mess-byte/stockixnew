const CH = "platform-saas-query-sync";

/** Notify other tabs to invalidate the same query key prefixes. */
export function broadcastQueryInvalidation(
	keys: readonly (readonly unknown[])[],
): void {
	if (typeof BroadcastChannel === "undefined" || keys.length === 0) return;
	try {
		const bc = new BroadcastChannel(CH);
		bc.postMessage({
			type: "invalidate",
			serialized: keys.map((k) => JSON.stringify(k)),
		});
		bc.close();
	} catch {
		/* ignore */
	}
}

export function subscribeQueryInvalidation(
	onKeys: (keys: readonly unknown[][]) => void,
): () => void {
	if (typeof BroadcastChannel === "undefined") return () => {};
	try {
		const bc = new BroadcastChannel(CH);
		bc.onmessage = (
			ev: MessageEvent<{ type?: string; serialized?: string[] }>,
		) => {
			const d = ev.data;
			if (d?.type !== "invalidate" || !Array.isArray(d.serialized)) return;
			const out: unknown[][] = [];
			for (const s of d.serialized) {
				try {
					out.push(JSON.parse(s) as unknown[]);
				} catch {
					/* skip */
				}
			}
			if (out.length) onKeys(out);
		};
		return () => bc.close();
	} catch {
		return () => {};
	}
}
