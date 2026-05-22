"use client";

import { useEffect, useState } from "react";

/**
 * Hook to debounce a value for professional, high-performance search inputs.
 * Prevents rapid-fire API calls during typing.
 */
export function useDebounce<T>(value: T, delay: number): T {
	const [debouncedValue, setDebouncedValue] = useState<T>(value);

	useEffect(() => {
		const handler = setTimeout(() => {
			setDebouncedValue(value);
		}, delay);

		return () => {
			clearTimeout(handler);
		};
	}, [value, delay]);

	return debouncedValue;
}
