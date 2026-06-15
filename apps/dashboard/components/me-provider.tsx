"use client";

import { createContext, type ReactNode } from "react";

import type { Me } from "@/hooks/use-me";

export const MeContext = createContext<Me | null | undefined>(undefined);

export function MeProvider({
  initialMe,
  children,
}: {
  initialMe: Me | null;
  children: ReactNode;
}) {
  return <MeContext.Provider value={initialMe}>{children}</MeContext.Provider>;
}
