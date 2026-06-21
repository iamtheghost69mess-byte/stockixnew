"use client";

import { useRouter } from "next/navigation";

import { toast } from "sonner";

import { posLogout } from "@/lib/pos-auth-api";
import { usePosAuthStore } from "@/stores/pos-auth-store";

export function usePosLogout() {
  const router = useRouter();
  const clearSession = usePosAuthStore((s) => s.clearSession);

  return async () => {
    try {
      await posLogout();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not sign out cleanly.");
    } finally {
      clearSession();
      router.replace("/login");
      router.refresh();
    }
  };
}
