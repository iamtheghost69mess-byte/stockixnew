"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type PosStatus = {
  configured?: boolean;
  reachable?: boolean;
  baseUrl?: string;
  frontendUrl?: string;
  pingError?: string;
};

export function PosHealthAlert() {
  const [status, setStatus] = useState<PosStatus | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/pos/status", { cache: "no-store" });
        const data = (await res.json()) as PosStatus;
        setStatus(data);
      } catch {
        setStatus({ reachable: false });
      }
    })();
  }, []);

  if (!status || status.reachable) return null;

  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>POS platform is not reachable</AlertTitle>
      <AlertDescription className="space-y-2 text-sm">
        <p>
          The control plane could not reach the POS API at{" "}
          <span className="font-mono">{status.baseUrl ?? "http://localhost:8010"}</span>
          {status.pingError ? ` (${status.pingError})` : ""}.
        </p>
        <p>
          From the repo root, run <span className="font-mono">pnpm dev</span> (starts API on 8010 and
          restaurant UI on 3001). First time: <span className="font-mono">pnpm dev:pos:install</span>.
        </p>
        {status.frontendUrl ? (
          <p>
            Restaurant POS UI (after stack is up):{" "}
            <Link href={status.frontendUrl} className="underline" target="_blank" rel="noreferrer">
              {status.frontendUrl}
            </Link>
          </p>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
