"use client";

import { useMe } from "@/hooks/use-me";

export function usePermissions(): string[] {
  const me = useMe();
  return me?.permissions ?? [];
}

export function useHasPermission(permission: string): boolean {
  const perms = usePermissions();
  if (perms.includes("*")) return true;
  return perms.includes(permission);
}

export function useHasAnyPermission(required: string[]): boolean {
  const perms = usePermissions();
  if (perms.includes("*")) return true;
  return required.some((p) => perms.includes(p));
}
