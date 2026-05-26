"use client";

import { useEffect, useState } from "react";

import { PmsPageShell } from "@/components/pms-page-shell";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePmsTenant } from "@/hooks/use-pms-tenant";
import { pmsFetch } from "@/lib/pms-fetch";

type Property = { id: string; name: string };
type CalEvent = {
  id: string;
  platform: string;
  icalUid: string;
  summary: string;
  startDate: string;
  endDate: string;
};

const PLATFORM_COLORS: Record<string, "default" | "secondary" | "outline"> = {
  airbnb: "default",
  booking: "secondary",
  vrbo: "outline",
  expedia: "outline",
};

function offsetDate(base: string, days: number): string {
  const d = new Date(`${base}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function PmsCalendarPage() {
  const { tenantId } = usePmsTenant();
  const today = new Date().toISOString().slice(0, 10);
  // Default window: today → today+90. Max selectable: today+730 to prevent huge scans.
  const defaultTo = offsetDate(today, 90);
  const maxDate = offsetDate(today, 730);

  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyId, setPropertyId] = useState("all");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(defaultTo);
  const [events, setEvents] = useState<CalEvent[]>([]);

  async function load(signal?: AbortSignal) {
    if (!tenantId) return;
    try {
      const params = new URLSearchParams({ from });
      if (propertyId !== "all") params.set("propertyId", propertyId);
      if (to) params.set("to", to);
      const res = await pmsFetch(`calendar/events?${params}`, tenantId, { signal });
      setEvents(((await res.json()) as { events?: CalEvent[] }).events ?? []);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
    }
  }

  useEffect(() => {
    if (!tenantId) return;
    void (async () => {
      const res = await pmsFetch("properties", tenantId);
      setProperties(((await res.json()) as { properties?: Property[] }).properties ?? []);
    })();
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    const ctrl = new AbortController();
    void load(ctrl.signal);
    return () => ctrl.abort();
  }, [tenantId, propertyId, from, to]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!tenantId) {
    return (
      <PmsPageShell title="Calendar">
        <p className="text-sm text-muted-foreground">Select a tenant on the Overview page first.</p>
      </PmsPageShell>
    );
  }

  return (
    <PmsPageShell title="Calendar" description="Synced OTA blocked dates from all iCal channels.">
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <Label>Property</Label>
          <Select value={propertyId} onValueChange={(v) => setPropertyId(v ?? "all")}>
            <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All properties</SelectItem>
              {properties.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>From</Label>
          <Input
            type="date"
            value={from}
            max={maxDate}
            onChange={(e) => setFrom(e.target.value)}
            className="w-[160px]"
          />
        </div>
        <div className="space-y-1">
          <Label>To</Label>
          <Input
            type="date"
            value={to}
            min={from}
            max={maxDate}
            onChange={(e) => setTo(e.target.value)}
            className="w-[160px]"
          />
        </div>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Platform</TableHead>
              <TableHead>Summary</TableHead>
              <TableHead>Start</TableHead>
              <TableHead>End</TableHead>
              <TableHead>UID</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No calendar events in this range.
                </TableCell>
              </TableRow>
            ) : (
              events.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>
                    <Badge variant={PLATFORM_COLORS[e.platform] ?? "outline"} className="capitalize">
                      {e.platform}
                    </Badge>
                  </TableCell>
                  <TableCell>{e.summary || "Blocked"}</TableCell>
                  <TableCell className="tabular-nums">{e.startDate}</TableCell>
                  <TableCell className="tabular-nums">{e.endDate}</TableCell>
                  <TableCell className="max-w-[180px] truncate font-mono text-xs text-muted-foreground">
                    {e.icalUid}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </PmsPageShell>
  );
}
