"use client";

import type { ReactNode } from "react";

import { useHasAnyPermission, useHasPermission } from "@/hooks/use-permissions";

type Props = {
  permission?: string;
  anyOf?: string[];
  children: ReactNode;
  fallback?: ReactNode;
};

export function RequirePermission({
  permission,
  anyOf,
  children,
  fallback = null,
}: Props) {
  const single = permission ? useHasPermission(permission) : false;
  const any = anyOf ? useHasAnyPermission(anyOf) : false;
  const allowed = permission ? single : anyOf ? any : true;
  if (!allowed) return <>{fallback}</>;
  return <>{children}</>;
}
