"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  ChevronRight,
  Clock,
  ExternalLink,
  History,
  LayoutGrid,
  Loader2,
  MapPin,
  Package,
  RefreshCcw,
  RotateCcw,
  TrendingDown,
  TrendingUp,
  Truck,
  User,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { fetchSerialHistory, SERIALS_QUERY_KEY } from "@/lib/pos-serial-api";
import { cn } from "@/lib/utils";

export default function SerialHistoryPage() {
  const { serial } = useParams();

  const { data: res, isLoading } = useQuery({
    queryKey: [SERIALS_QUERY_KEY, "history", serial],
    queryFn: () => fetchSerialHistory(serial as string),
  });

  const data = res?.data;

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost">
          <Link href="/dashboard/inventory/serials">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Tracker
          </Link>
        </Button>
        <div className="flex flex-col items-center py-20 border rounded-lg bg-card shadow-sm text-center">
          <AlertCircle className="h-10 w-10 text-destructive mb-3" />
          <h2 className="text-xl font-bold">Serial Not Found</h2>
          <p className="text-muted-foreground">The unit identifier "{serial}" does not exist in our system.</p>
        </div>
      </div>
    );
  }

  const { serial: sn, movements } = data;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <Button asChild variant="ghost" className="-ml-4 h-8 text-muted-foreground hover:text-foreground">
            <Link href="/dashboard/inventory/serials">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Serial Tracker
            </Link>
          </Button>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{sn.serial}</h1>
            <SerialStatusBadge status={sn.status} />
          </div>
          <p className="text-muted-foreground">
            {sn.ingredient.name} — SKU: {sn.ingredient.sku}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href={`/dashboard/ingredients?search=${sn.ingredient.name}`}>Manage Item</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-4 w-4" /> Current Location
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold">{(sn.location as any)?.name || "Not in Stock"}</div>
            <p className="text-xs text-muted-foreground mt-1">Bin: {(sn.bin as any)?.name || "Unassigned"}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4" /> Created Date
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold">{format(new Date(sn.createdAt), "MMM d, yyyy")}</div>
            <p className="text-xs text-muted-foreground mt-1">Initial warehouse intake</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
              <RefreshCcw className="h-4 w-4" /> Total Movements
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold">{movements.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Chain of custody transitions</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border shadow-md">
        <CardHeader>
          <CardTitle>Chain of Custody Ledger</CardTitle>
          <CardDescription>Comprehensive audit trail for this specific unit ID.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="relative">
            <div className="absolute left-[39px] top-0 bottom-0 w-px bg-muted-foreground/20" />
            <div className="space-y-0">
              {movements.map((movement, i) => (
                <div key={movement._id} className="relative pl-20 pr-6 py-6 group hover:bg-muted/30 transition-colors">
                  {/* Timeline Dot */}
                  <div
                    className={cn(
                      "absolute left-[32px] top-7 h-4 w-4 rounded-full border-2 border-background z-10",
                      getMovementColor(movement.type),
                    )}
                  />

                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm uppercase tracking-tight">
                          {movement.type.replace("_", " ")}
                        </span>
                        <span className="text-xs text-muted-foreground">•</span>
                        <span className="text-sm font-medium">{getMovementDescription(movement)}</span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {format(new Date(movement.createdAt), "MMM d, yyyy HH:mm")}
                        </div>
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {movement.user?.name || "System"}
                        </div>
                      </div>
                    </div>
                    <Badge variant="outline" className="mt-2 sm:mt-0 font-mono text-[10px] h-5">
                      ID: {movement._id.slice(-6).toUpperCase()}
                    </Badge>
                  </div>

                  {movement.notes && (
                    <div className="mt-2 text-xs text-muted-foreground italic bg-muted/20 p-2 rounded border-l-2 border-muted leading-relaxed">
                      "{movement.notes}"
                    </div>
                  )}

                  {i !== movements.length - 1 && <Separator className="mt-6 ml-[-20px]" />}
                </div>
              ))}

              {movements.length === 0 && (
                <div className="p-10 text-center text-muted-foreground">
                  <History className="h-8 w-8 mx-auto opacity-20 mb-2" />
                  <p>No logged movement records for this serial number.</p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SerialStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "available":
      return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">Available</Badge>;
    case "consumed":
      return <Badge className="bg-blue-50 text-blue-700 border-blue-200">Consumed</Badge>;
    case "transferred":
      return <Badge className="bg-amber-50 text-amber-700 border-amber-200">In Transit</Badge>;
    case "expired":
      return <Badge variant="destructive">Expired</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function getMovementColor(type: string) {
  switch (type) {
    case "adjustment_in":
      return "bg-green-500";
    case "purchase_receive":
      return "bg-blue-500";
    case "transfer":
      return "bg-amber-500";
    case "sale":
      return "bg-purple-500";
    case "order_consumption":
      return "bg-purple-500";
    case "adjustment_out":
      return "bg-destructive";
    case "vendor_return":
      return "bg-orange-500";
    case "waste":
      return "bg-destructive";
    default:
      return "bg-slate-500";
  }
}

function getMovementDescription(mv: any) {
  const isPos = mv.quantity > 0;
  switch (mv.type) {
    case "purchase_receive":
      return `Received from vendor at ${mv.location?.name}`;
    case "transfer":
      return `Moved from ${mv.location?.name} to ${mv.counterLocation?.name}`;
    case "adjustment_in":
      return `Manually added to stock at ${mv.location?.name}`;
    case "adjustment_out":
      return `Manually removed from stock at ${mv.location?.name}`;
    case "sale":
    case "order_consumption":
      return `Consumed via Customer Order`;
    case "vendor_return":
      return `Returned to vendor from ${mv.location?.name}`;
    case "waste":
      return `Logged as waste @ ${mv.location?.name}`;
    default:
      return `${isPos ? "Added to" : "Removed from"} ${mv.location?.name}`;
  }
}
