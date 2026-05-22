"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

const ORDER = ["light", "dark", "system"] as const;

export function PlatformShellHeaderEnd() {
	const { theme, setTheme } = useTheme();
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	const cycle = () => {
		const current = (theme ?? "system") as (typeof ORDER)[number];
		const i = ORDER.indexOf(current);
		setTheme(ORDER[(i + 1) % ORDER.length]);
	};

	const resolved = theme ?? "system";

	return (
		<Button
			type="button"
			size="icon"
			onClick={cycle}
			disabled={!mounted}
			aria-label={`Theme: ${resolved}. Click to cycle light, dark, and system.`}
		>
			{resolved === "system" ? (
				<Monitor />
			) : resolved === "dark" ? (
				<Sun />
			) : (
				<Moon />
			)}
		</Button>
	);
}
