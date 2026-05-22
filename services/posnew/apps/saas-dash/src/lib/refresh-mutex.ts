let inFlight: Promise<boolean> | null = null;

/** Test-only: clears in-flight refresh so MSW cases stay isolated. */
export function resetSingleFlightRefreshForTests(): void {
	inFlight = null;
}

export async function singleFlightRefresh(
	run: () => Promise<boolean>,
): Promise<boolean> {
	if (!inFlight) {
		inFlight = run().finally(() => {
			inFlight = null;
		});
	}
	return inFlight;
}
