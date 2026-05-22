"use client";

import { ReactNode } from "react";

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  // Better Auth doesn't need a provider wrapper
  // The authClient is used directly in components
  return <>{children}</>;
}
