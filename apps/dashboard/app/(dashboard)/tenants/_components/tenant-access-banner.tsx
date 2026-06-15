"use client";

import { ExternalLink } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type TenantAccessBannerProps = {
  oneTimePassword: string | null;
  tenantAccess: {
    publicUrl: string | null;
    adminEmail: string;
  } | null;
};

export function TenantAccessBanner({
  oneTimePassword,
  tenantAccess,
}: TenantAccessBannerProps) {
  if (!oneTimePassword && !tenantAccess) return null;

  return (
    <div className="rounded-xl border border-border bg-muted/40 px-4 py-4 text-sm space-y-3">
      <div>
        <p className="font-medium text-foreground">Tenant admin access</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Use the admin email you entered below. The password is{" "}
          <strong>not</strong> your Stockix password — the platform issues a
          one-time password once and registers that admin in the tenant app.
          After you leave this page, use{" "}
          <strong>Open login</strong> in the tenant list — it stays there.
        </p>
        {tenantAccess ? (
          <p className="mt-2 text-xs">
            <span className="text-muted-foreground">Admin email:</span>{" "}
            <span className="font-mono">{tenantAccess.adminEmail}</span>
          </p>
        ) : null}
      </div>
      {oneTimePassword ? (
        <div>
          <p className="font-medium text-foreground">Bootstrap password (shown once)</p>
          <p className="mt-1 break-all font-mono text-xs">{oneTimePassword}</p>
        </div>
      ) : (
        <p className="text-xs text-amber-800 dark:text-amber-200">
          Password not in this response (job may have expired). Use password
          reset in the tenant app or check API logs from the provision run.
        </p>
      )}
      {tenantAccess?.publicUrl ? (
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`${tenantAccess.publicUrl}/auth/login`}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: "default" }))}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            Open login
          </a>
          <span className="text-xs text-muted-foreground">
            Same link stays under{" "}
            <span className="font-semibold">Existing tenants</span> below.
          </span>
        </div>
      ) : null}
    </div>
  );
}
