"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

import { useMe } from "@/hooks/use-me";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/alert";

export function MailHealthBanner() {
  const { me } = useMe();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const isSuperAdmin = me?.role === "super_admin";

  const showBanner = isSuperAdmin && configured === false;

  useEffect(() => {
    if (!isSuperAdmin) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        const data = (await res.json()) as {
          mail?: { configured?: boolean };
        };
        if (!cancelled) {
          setConfigured(Boolean(data.mail?.configured));
        }
      } catch {
        if (!cancelled) setConfigured(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSuperAdmin]);

  if (!showBanner) return null;

  return (
    <Alert variant="destructive" className="mb-4 border-amber-500/50 bg-amber-500/10 text-amber-950 dark:text-amber-100">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Transactional email disabled</AlertTitle>
      <AlertDescription>
        MAIL_PASSWORD and MAIL_FROM_ADDRESS are not configured on the API. Owner invites,
        password resets, and provision welcome emails will not be sent until Resend SMTP is
        configured.
      </AlertDescription>
    </Alert>
  );
}
