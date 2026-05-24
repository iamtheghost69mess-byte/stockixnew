"use client";

import { CheckCircle2, Circle, Clock, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { LicenseStatus } from "@/types/license";

function label(s: LicenseStatus): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function LicenseStatusBadge({ status }: { status: LicenseStatus }) {
  if (status === "active") {
    return (
      <Badge className="gap-1 border-emerald-600/30 bg-emerald-600/15 text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="h-3.5 w-3.5" />
        {label(status)}
      </Badge>
    );
  }
  if (status === "unassigned") {
    return (
      <Badge variant="secondary" className="gap-1">
        <Circle className="h-3.5 w-3.5" />
        {label(status)}
      </Badge>
    );
  }
  if (status === "revoked") {
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="h-3.5 w-3.5" />
        {label(status)}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 border-amber-500/50 text-amber-700 dark:text-amber-400">
      <Clock className="h-3.5 w-3.5" />
      {label(status)}
    </Badge>
  );
}
