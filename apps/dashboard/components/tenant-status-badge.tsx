"use client";

import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  PauseCircle,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export default function TenantStatusBadge({ status }: { status: string }) {
  const normalized = (status || "unknown").toLowerCase();
  const label = normalized.replace(/_/g, " ");

  if (normalized === "active") {
    return (
      <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
        <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
        {label}
      </Badge>
    );
  }

  if (normalized === "partial") {
    return (
      <Badge variant="outline" className="border-amber-500/60 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
        <AlertCircle className="mr-1 h-3.5 w-3.5" />
        {label}
      </Badge>
    );
  }

  if (normalized === "suspended") {
    return (
      <Badge variant="secondary">
        <PauseCircle className="mr-1 h-3.5 w-3.5" />
        {label}
      </Badge>
    );
  }

  if (normalized === "provisioning" || normalized === "pending") {
    return (
      <Badge variant="outline" className="border-amber-500/60 text-amber-700">
        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
        {label}
      </Badge>
    );
  }

  if (normalized === "failed") {
    return (
      <Badge variant="destructive">
        <XCircle className="mr-1 h-3.5 w-3.5" />
        {label}
      </Badge>
    );
  }

  if (normalized === "terminated") {
    return (
      <Badge variant="secondary">
        <XCircle className="mr-1 h-3.5 w-3.5" />
        {label}
      </Badge>
    );
  }

  return (
    <Badge variant="secondary" className={cn("capitalize")}>
      <AlertCircle className="mr-1 h-3.5 w-3.5" />
      {label}
    </Badge>
  );
}
