"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type TenantIdConfirmFieldProps = {
  tenantId: string;
  value: string;
  onChange: (value: string) => void;
  inputId?: string;
};

export function TenantIdConfirmField({
  tenantId,
  value,
  onChange,
  inputId = "tenant-id-confirm",
}: TenantIdConfirmFieldProps) {
  const isMismatch = value.length > 0 && value !== tenantId;

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">Tenant ID (UUID)</Label>
        <div className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2.5">
          <code className="block w-full select-all break-all rounded-md border border-border/80 bg-background px-2.5 py-1.5 font-mono text-xs font-semibold text-foreground leading-normal">
            {tenantId}
          </code>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={inputId} className="text-xs font-medium text-muted-foreground">
          Confirmation
        </Label>
        <Input
          id={inputId}
          placeholder="Type the exact Tenant ID here"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
          className="font-mono text-xs"
        />
        {isMismatch && (
          <p className="text-xs font-semibold text-destructive mt-1">
            Tenant ID does not match
          </p>
        )}
      </div>
    </div>
  );
}
