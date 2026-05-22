"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuthStore } from "@/lib/auth-store";

export function SessionExpiredDialog() {
	const router = useRouter();
	const open = useAuthStore((s) => s.sessionExpiredOpen);
	const close = useAuthStore((s) => s.closeSessionExpired);
	const logout = useAuthStore((s) => s.logout);

	useEffect(() => {
		if (!open) return;
		logout({ sessionExpired: true });
		close();
		router.replace("/login");
	}, [open, logout, close, router]);

	return null;
}
