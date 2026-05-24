"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { posGetCreditNote } from "@/lib/pos-accounting-api";
import { posCan } from "@/lib/pos-permissions";
import { formatCurrency } from "@/lib/utils";
import { usePosAuthStore } from "@/stores/pos-auth-store";

export default function CreditNoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const permissions = usePosAuthStore((s) => s.user?.permissions ?? []);
  const canArRead = posCan(permissions, "backoffice.accounting.ar.read");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["accounting", "credit-note", id],
    queryFn: () => posGetCreditNote(id),
    enabled: canArRead && Boolean(id),
  });

  if (!canArRead) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">You need AR read permission.</p>
        <Button variant="link" asChild className="mt-2 h-auto px-0">
          <Link href="/dashboard/accounting">Back</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 p-6">
      <Button variant="ghost" size="sm" className="-ml-2" asChild>
        <Link href="/dashboard/accounting/credit-notes">
          <ArrowLeft className="mr-2 size-4" />
          Credit notes
        </Link>
      </Button>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      ) : isError ? (
        <p className="text-destructive text-sm">{error instanceof Error ? error.message : "Failed to load."}</p>
      ) : data ? (
        <Card>
          <CardHeader>
            <CardTitle className="font-mono">{data.creditNoteNumber}</CardTitle>
            <CardDescription className="capitalize">Status: {data.status}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total</span>
              <span className="font-medium font-mono">{formatCurrency(data.total)}</span>
            </div>
            {data.reason ? (
              <div>
                <p className="text-muted-foreground text-xs uppercase">Reason</p>
                <p>{data.reason}</p>
              </div>
            ) : null}
            {data.notes ? (
              <div>
                <p className="text-muted-foreground text-xs uppercase">Notes</p>
                <p className="whitespace-pre-wrap">{data.notes}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <p className="text-muted-foreground text-sm">Not found.</p>
      )}
    </div>
  );
}
