"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "@/components/reusabletoast";

import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import { Label } from "@repo/ui/label";

type TenantSlugConfirmFieldProps = {
  slug: string;
  value: string;
  onChange: (value: string) => void;
  inputId?: string;
};

export function TenantSlugConfirmField({
  slug,
  value,
  onChange,
  inputId = "tenant-slug-confirm",
}: TenantSlugConfirmFieldProps) {
  const [copied, setCopied] = useState(false);

  const copySlug = async () => {
    try {
      await navigator.clipboard.writeText(slug);
      setCopied(true);
      toast.success("Tenant slug copied");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">Tenant slug</Label>
        <div className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2.5">
          <Badge
            variant="outline"
            className="h-auto max-w-full whitespace-normal break-all rounded-md border-border/80 bg-background px-2 py-1 font-mono text-xs font-normal"
          >
            {slug}
          </Badge>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ml-auto h-7 shrink-0 gap-1.5 px-2"
            aria-label="Copy tenant slug"
            onClick={() => void copySlug()}
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                Copy
              </>
            )}
          </Button>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={inputId} className="text-xs font-medium text-muted-foreground">
          Confirmation
        </Label>
        <Input
          id={inputId}
          placeholder="Paste tenant slug here"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
          className="font-mono"
        />
      </div>
    </div>
  );
}
