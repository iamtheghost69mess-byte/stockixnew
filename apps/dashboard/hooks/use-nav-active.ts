"use client";

import { usePathname } from "next/navigation";

import { useMounted } from "@/hooks/use-mounted";

/**
 * Returns whether a nav href is active. Inactive until mounted so server and
 * client markup match during hydration (pathname/active state are client-only).
 */
export function useNavIsActive() {
  const pathname = usePathname();
  const mounted = useMounted();

  return (href: string, options?: { exact?: boolean }) => {
    if (!mounted) return false;
    const exact = options?.exact ?? href === "/";
    if (href === "/") return pathname === "/";
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  };
}
