"use client";

import { useEffect } from "react";

import { useRouter } from "next/navigation";

import { isHostessUser } from "@/lib/pos-staff-role";
import { usePosAuthStore } from "@/stores/pos-auth-store";

/**
 * Hostess staff use `/dashboard/floor` only; if they hit live POS routes, send them back.
 */
export function PosHostessPosRedirect() {
  const router = useRouter();
  const user = usePosAuthStore((s) => s.user);

  useEffect(() => {
    if (user && isHostessUser(user)) {
      router.replace("/dashboard/floor");
    }
  }, [router, user]);

  return null;
}
