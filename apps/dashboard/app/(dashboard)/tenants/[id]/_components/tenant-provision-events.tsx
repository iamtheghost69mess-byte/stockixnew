"use client";

import { History } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { formatTime } from "@/lib/date-format";
import type { ProvisionEventRow } from "@/types/tenant";

export type TenantProvisionEventsProps = {
  events: ProvisionEventRow[];
  eventsLoading: boolean;
  shouldPollProvisioning: boolean;
  provisionPollTimedOut: boolean;
  isProvisioning: boolean;
  onRefresh: () => void;
};

export function TenantProvisionEvents({
  events,
  eventsLoading,
  shouldPollProvisioning,
  provisionPollTimedOut,
  isProvisioning,
  onRefresh,
}: TenantProvisionEventsProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Provisioning History</CardTitle>
        <Button variant="ghost" size="sm" onClick={onRefresh}>
          {shouldPollProvisioning
            ? "Live (auto-refreshing)"
            : provisionPollTimedOut && isProvisioning
              ? "Refresh (auto-refresh paused)"
              : "Refresh"}
        </Button>
      </CardHeader>
      <CardContent>
        {eventsLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : events.length === 0 ? (
          <EmptyState
            icon={History}
            title="No provisioning events yet"
            description="When this tenant is provisioned or retried, lifecycle steps will appear here."
          />
        ) : (
          <ScrollArea className="h-[400px]">
            <div className="space-y-2 text-sm">
              {events.map((e) => (
                <div key={e.id} className="rounded border p-2">
                  <p className="font-mono text-xs text-muted-foreground">{formatTime(e.createdAt)}</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{e.phase}</Badge>
                    <span
                      className={
                        e.level === "error"
                          ? "text-destructive"
                          : e.level === "warn"
                            ? "text-amber-600"
                            : ""
                      }
                    >
                      {e.message}
                      {e.parentTenantId ? (
                        <span className="ml-2 text-xs text-muted-foreground">
                          (sub-org: {e.slug ?? "unknown"})
                        </span>
                      ) : null}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
