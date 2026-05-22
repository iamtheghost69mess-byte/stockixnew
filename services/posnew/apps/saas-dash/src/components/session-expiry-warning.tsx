"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/auth-store";
import { jwtExpiresAtMs } from "@/lib/jwt-exp";

function readWarnLeadMs(): number {
	const raw = process.env.NEXT_PUBLIC_PLATFORM_SESSION_WARN_LEAD_MS;
	const n = raw ? Number(raw) : NaN;
	if (Number.isFinite(n) && n > 0) return n;
	return 5 * 60 * 1000;
}

function readIdleMs(): number {
	const raw = process.env.NEXT_PUBLIC_PLATFORM_IDLE_MS_BEFORE_WARN;
	const n = raw ? Number(raw) : NaN;
	if (Number.isFinite(n) && n > 0) return n;
	return 25 * 60 * 1000;
}

/**
 * Non-blocking session reminder: JWT `exp` (decoded client-side, unverified) and/or idle time.
 * `/auth/me` does not expose token expiry; see HANDOFF.md.
 */
export function SessionExpiryWarning() {
	const user = useAuthStore((s) => s.user);
	const refreshSession = useAuthStore((s) => s.refreshSession);
	const [open, setOpen] = useState(false);
	const lastActivityRef = useRef(Date.now());
	const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const snoozeUntilRef = useRef(0);

	useEffect(() => {
		const bump = () => {
			lastActivityRef.current = Date.now();
		};
		const opts = { passive: true } as AddEventListenerOptions;
		window.addEventListener("keydown", bump, opts);
		window.addEventListener("pointerdown", bump, opts);
		window.addEventListener("scroll", bump, opts);
		return () => {
			window.removeEventListener("keydown", bump, opts);
			window.removeEventListener("pointerdown", bump, opts);
			window.removeEventListener("scroll", bump, opts);
		};
	}, []);

	useEffect(() => {
		if (!user) {
			setOpen(false);
			return;
		}

		const check = () => {
			const now = Date.now();
			if (now < snoozeUntilRef.current) return;
			const idleMs = readIdleMs();
			const idleExceeded = now - lastActivityRef.current >= idleMs;
			if (idleExceeded) setOpen(true);
		};

		check();
		tickRef.current = setInterval(check, 30_000);
		return () => {
			if (tickRef.current) clearInterval(tickRef.current);
		};
	}, [user]);

	return (
		<AlertDialog
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) snoozeUntilRef.current = Date.now() + 5 * 60 * 1000;
			}}
		>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Stay signed in?</AlertDialogTitle>
					<AlertDialogDescription>
						Your session may expire soon, or you have been idle for a while.
						Refresh your session to keep working.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter className="flex-col gap-2 sm:flex-row">
					<Button
						type="button"
						onClick={async () => {
							const ok = await refreshSession();
							setOpen(false);
							if (ok) {
								lastActivityRef.current = Date.now();
								snoozeUntilRef.current = 0;
								toast.success("Session extended");
							} else toast.error("Could not refresh session");
						}}
					>
						Stay signed in
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
