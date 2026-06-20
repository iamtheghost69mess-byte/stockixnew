"use client";

import { TooltipProvider } from "@repo/ui/tooltip";

export function Providers({ children }: { children: React.ReactNode }) {
  return <TooltipProvider>{children}</TooltipProvider>;
}
