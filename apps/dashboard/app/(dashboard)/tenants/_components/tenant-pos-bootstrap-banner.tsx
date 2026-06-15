"use client";

import { Copy } from "lucide-react";
import { toast } from "@/components/reusabletoast";

import { Button } from "@/components/ui/button";

export type PosBootstrapCredentialsPayload = {
  adminPin: string;
  allRoles: { role: string; username: string; pin: string }[];
};

type TenantPosBootstrapBannerProps = {
  posDefaultCredentials: PosBootstrapCredentialsPayload | null;
};

export function TenantPosBootstrapBanner({
  posDefaultCredentials,
}: TenantPosBootstrapBannerProps) {
  if (!posDefaultCredentials?.allRoles?.length) return null;

  const copyText = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  return (
    <div className="rounded-xl border border-border bg-muted/40 px-4 py-4 text-sm space-y-3">
      <div>
        <p className="font-medium text-foreground">POS staff PINs (shown once)</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Save these PINs before leaving this page. They are not stored in plaintext on the
          platform afterward — use <strong>Reset PIN</strong> on the tenant profile if you miss
          them.
        </p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Admin PIN</p>
        <p className="mt-0.5 flex items-center gap-2 font-mono text-xs">
          {posDefaultCredentials.adminPin}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={() => void copyText("Admin PIN", posDefaultCredentials.adminPin)}
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </p>
      </div>
      <ul className="space-y-1 font-mono text-xs">
        {posDefaultCredentials.allRoles.map((row) => (
          <li key={`${row.role}-${row.username}`} className="flex flex-wrap items-center gap-2">
            <span className="capitalize text-muted-foreground">{row.role}</span>
            <span>/</span>
            <span>{row.username}</span>
            <span>:</span>
            <span>{row.pin}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => void copyText(`${row.role} PIN`, row.pin)}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
