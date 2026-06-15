"use client";

import { format } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TabsContent } from "@/components/ui/tabs";

import {
  formatHistoryAction,
  getActionVariant,
  type LicenseHistoryEntry,
} from "./license-detail-utils";

type LicenseHistoryTableProps = {
  history: LicenseHistoryEntry[];
  historyLoading: boolean;
};

export function LicenseHistoryTable({ history, historyLoading }: LicenseHistoryTableProps) {
  return (
    <TabsContent value="history" className="mt-4">
      <Card>
        <CardHeader>
          <CardTitle>License history</CardTitle>
          <CardDescription>Append-only audit trail for this license</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {historyLoading ? (
            <p className="text-sm text-muted-foreground">Loading history…</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No history recorded yet.</p>
          ) : (
            history.map((entry) => (
              <div
                key={entry.id}
                className="flex flex-col gap-2 border-b border-border/60 pb-4 last:border-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0 flex-1 space-y-2">
                  <Badge variant={getActionVariant(entry.action)} className="capitalize">
                    {formatHistoryAction(entry.action)}
                  </Badge>
                  {entry.actorEmail ? (
                    <p className="text-sm text-muted-foreground">by {entry.actorEmail}</p>
                  ) : null}
                  {entry.notes ? <p className="text-sm">{entry.notes}</p> : null}
                  {entry.newValues ? (
                    <pre className="max-h-40 overflow-auto rounded-md bg-muted/50 p-2 text-xs">
                      {JSON.stringify(entry.newValues, null, 2)}
                    </pre>
                  ) : null}
                </div>
                <p className="shrink-0 text-xs text-muted-foreground sm:text-sm">
                  {format(new Date(entry.createdAt), "PPp")}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </TabsContent>
  );
}
