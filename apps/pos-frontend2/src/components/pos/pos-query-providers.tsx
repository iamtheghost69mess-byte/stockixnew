"use client";

import { type ReactNode, useState } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { PosInventoryPolicyPrefetch } from "@/components/pos/pos-inventory-policy-prefetch";
import { PosRealtimeBridge } from "@/components/pos/pos-realtime-bridge";
import { ServiceWorkerRegistrar } from "@/components/pos/service-worker-registrar";
import { PosSyncManager } from "@/components/pos/sync-manager";

export function PosQueryProviders({ children }: Readonly<{ children: ReactNode }>) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ServiceWorkerRegistrar />
      <PosSyncManager />
      <PosInventoryPolicyPrefetch />
      <PosRealtimeBridge />
    </QueryClientProvider>
  );
}
