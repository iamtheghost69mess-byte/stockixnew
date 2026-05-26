"use client";

import { useMemo, useState } from "react";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  DollarSign,
  EyeOff,
  Loader2,
  Save,
  Search,
  Send,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { INGREDIENTS_QUERY_KEY, invalidateInventoryHubQueries } from "@/lib/inventory-api";
import {
  type StockTakeLine,
  posGetStockTakeSession,
  posPatchStockTakeCounts,
  posPostStockTakeSession,
} from "@/lib/pos-stock-take-api";
import {
  isStockTakeSerialVarianceError,
  serialLinesWithVariance,
} from "@/lib/stock-take-serial-guard";

function loadErrorHint(err: unknown): string | null {
  const msg = err instanceof Error ? err.message : String(err);
  if (/403|do not have permission|permission to view inventory/i.test(msg)) {
    return "You may need a manager or admin with inventory access.";
  }
  if (/404|not found/i.test(msg)) {
    return "This session may have been removed or the link is wrong.";
  }
  return null;
}

export default function StockTakeDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const queryClient = useQueryClient();
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isFinalizeDialogOpen, setIsFinalizeDialogOpen] = useState(false);

  // 1. Fetch Data
  const {
    data: sessionRes,
    isLoading,
    isError,
    error: loadError,
  } = useQuery({
    queryKey: ["stock-take-session", id],
    queryFn: () => posGetStockTakeSession(id),
    enabled: !!id,
  });
  const session = sessionRes?.data;

  // 2. Mutations
  const saveMutation = useMutation({
    mutationFn: (lines: { lineId: string; countedQty: number }[]) => posPatchStockTakeCounts(id, lines),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-take-session", id] });
      toast.success("Progress saved.");
      setCounts({}); // Clear local buffer
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to save counts.";
      const hint = loadErrorHint(err);
      toast.error(hint ? `${msg} ${hint}` : msg);
    },
  });

  const postMutation = useMutation({
    mutationFn: () => posPostStockTakeSession(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-take-session", id] });
      queryClient.invalidateQueries({ queryKey: ["stock-take-sessions"] });
      void queryClient.invalidateQueries({ queryKey: INGREDIENTS_QUERY_KEY });
      invalidateInventoryHubQueries(queryClient);
      toast.success("Session finalized and stock adjusted.");
      router.push("/dashboard/inventory/stock-take");
    },
    onError: (err: unknown) => {
      if (isStockTakeSerialVarianceError(err)) {
        toast.error(
          "Serial-tracked items with a count variance must be adjusted from Inventory using serial numbers, not stock take post.",
        );
        return;
      }
      const msg = err instanceof Error ? err.message : "Failed to finalize session.";
      const hint = loadErrorHint(err);
      toast.error(hint ? `${msg} ${hint}` : msg);
    },
  });

  // 3. Logic
  const filteredLines = useMemo(() => {
    if (!session?.lines) return [];
    return session.lines.filter((line) => {
      const ing = typeof line.ingredient === "object" ? line.ingredient : null;
      if (!ing) return false;
      return (
        ing.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ing.sku?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    });
  }, [session?.lines, searchTerm]);

  const showBinColumn = useMemo(
    () => Boolean(session?.lines?.some((l) => l.bin != null && l.bin !== "")),
    [session?.lines],
  );

  const serialVarianceLines = useMemo(
    () => serialLinesWithVariance(session?.lines ?? [], counts),
    [session?.lines, counts],
  );

  const serialPostBlocked = serialVarianceLines.length > 0;

  function binLabel(bin: StockTakeLine["bin"]): string {
    if (bin == null || bin === "") return "—";
    if (typeof bin === "object" && bin !== null && "_id" in bin) {
      const name = "name" in bin && bin.name ? String(bin.name) : "";
      const code = "code" in bin && bin.code ? String(bin.code) : "";
      return [name, code].filter(Boolean).join(" · ") || String(bin._id);
    }
    return String(bin);
  }

  const handleCountChange = (lineId: string, val: string) => {
    const num = parseFloat(val);
    if (!Number.isNaN(num) && num >= 0) {
      setCounts((prev) => ({ ...prev, [lineId]: num }));
    } else if (val === "") {
      setCounts((prev) => {
        const next = { ...prev };
        delete next[lineId];
        return next;
      });
    }
  };

  const handleSave = () => {
    const lines = Object.entries(counts).map(([lineId, countedQty]) => ({
      lineId,
      countedQty,
    }));
    if (lines.length === 0) {
      toast.info("No new counts to save.");
      return;
    }
    saveMutation.mutate(lines);
  };

  const handlePost = () => {
    if (!session || session.status === "posted") return;
    if (saveMutation.isPending || postMutation.isPending || isFinalizing) return;
    if (serialPostBlocked) {
      toast.error(
        "Resolve serial-tracked variances via Inventory → Adjust before finalizing this session.",
      );
      return;
    }

    const allLinesCounted = session.lines.every((line) => {
      const existing = line.countedQty !== null && line.countedQty !== undefined;
      const local = counts[line._id] !== undefined;
      return existing || local;
    });

    if (!allLinesCounted) {
      toast.error("Please provide counts for all items before finalizing.");
      return;
    }
    setIsFinalizeDialogOpen(true);
  };

  const handleConfirmPost = async () => {
    if (!session || session.status === "posted") return;
    if (saveMutation.isPending || postMutation.isPending || isFinalizing) return;

    setIsFinalizeDialogOpen(false);
    setIsFinalizing(true);
    try {
      const pending = Object.entries(counts).map(([lineId, countedQty]) => ({ lineId, countedQty }));
      if (pending.length > 0) {
        await saveMutation.mutateAsync(pending);
      }
      await postMutation.mutateAsync();
    } catch {
      /* Errors toast via mutation onError */
    } finally {
      setIsFinalizing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError) {
    const hint = loadErrorHint(loadError);
    return (
      <div className="mx-auto max-w-lg space-y-4 p-6">
        <Button variant="ghost" size="sm" className="gap-2" asChild>
          <Link href="/dashboard/inventory/stock-take">
            <ArrowLeft className="size-4" />
            Back to stock take
          </Link>
        </Button>
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>Could not open this session</AlertTitle>
          <AlertDescription>
            {loadError instanceof Error ? loadError.message : "Request failed."}
            {hint ? ` ${hint}` : ""}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-6">
        <Button variant="ghost" size="sm" className="gap-2" asChild>
          <Link href="/dashboard/inventory/stock-take">
            <ArrowLeft className="size-4" />
            Back to stock take
          </Link>
        </Button>
        <Alert>
          <AlertTitle>Session not found</AlertTitle>
          <AlertDescription>It may have been deleted. Return to the list and open a current session.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const isPosted = session.status === "posted";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/dashboard/inventory/stock-take">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-2xl tracking-tight">Audit: {(session.location as any).name}</h1>
              <Badge variant={isPosted ? "secondary" : "default"}>{isPosted ? "Finalized" : "In Progress"}</Badge>
            </div>
            <p className="text-muted-foreground text-sm">
              Started {format(new Date(session.createdAt), "MMM d, HH:mm")} • {session.lines.length} items to count
              {session.blindCount && (
                <span className="ml-2 inline-flex items-center gap-1 font-medium text-amber-600">
                  <EyeOff className="size-3" /> Blind Audit
                </span>
              )}
            </p>
          </div>
        </div>
        {!isPosted && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleSave}
              disabled={saveMutation.isPending || Object.keys(counts).length === 0}
            >
              {saveMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save Progress
            </Button>
            <Button
              onClick={handlePost}
              disabled={
                postMutation.isPending ||
                saveMutation.isPending ||
                isFinalizing ||
                serialPostBlocked
              }
              title={
                serialPostBlocked
                  ? "Serial-tracked lines with variance must use Inventory → Adjust with serial numbers"
                  : undefined
              }
            >
              {postMutation.isPending || isFinalizing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Finalize audit
            </Button>
          </div>
        )}
      </div>

      {serialPostBlocked && !isPosted ? (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>Serial-tracked items need a different workflow</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>
              These lines have a physical count that does not match system quantity. Stock take cannot post variance
              for serial-tracked ingredients — use Inventory → Adjust and enter serial numbers.
            </p>
            <ul className="list-inside list-disc text-sm">
              {serialVarianceLines.map((row) => (
                <li key={row.lineId}>
                  <Link
                    href={`/dashboard/inventory?adjustIngredientId=${encodeURIComponent(row.ingredientId)}`}
                    className="underline"
                  >
                    {row.ingredientName}
                  </Link>
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      {isPosted && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card className="border-green-500/20 bg-green-500/5">
            <CardHeader className="pb-2">
              <CardDescription className="text-green-700/70 dark:text-green-400/70">Audit Status</CardDescription>
              <CardTitle className="flex items-center gap-2 text-green-700 dark:text-green-400">
                <CheckCircle2 className="size-5" /> Finalized
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs">Reconciled on {format(new Date(session.postedAt!), "MMM d, HH:mm")}</p>
            </CardContent>
          </Card>

          <Card
            className={
              session.lines.some((l) => (l.varianceValue || 0) < 0)
                ? "border-destructive/20 bg-destructive/5"
                : "border-primary/20 bg-primary/5"
            }
          >
            <CardHeader className="pb-2">
              <CardDescription>Financial Impact</CardDescription>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="size-5" />
                {session.lines.reduce((acc, l) => acc + (l.varianceValue || 0), 0).toFixed(2)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs">Net inventory value change</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Accuracy Rate</CardDescription>
              <CardTitle className="flex items-center gap-2">
                {(() => {
                  const accurate = session.lines.filter((l) => Math.abs(l.varianceQty || 0) < 0.001).length;
                  const rate = (accurate / session.lines.length) * 100;
                  return `${rate.toFixed(1)}%`;
                })()}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs">
                {session.lines.filter((l) => Math.abs(l.varianceQty || 0) > 0.001).length} discrepancies found
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div className="space-y-1">
            <CardTitle>Inventory Items</CardTitle>
            <CardDescription>
              Enter physical counts for each ingredient. Discrepancies will be highlighted.
            </CardDescription>
          </div>
          <div className="relative w-72">
            <Search className="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search items..."
              className="h-9 pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ingredient</TableHead>
                {showBinColumn ? <TableHead>Bin</TableHead> : null}
                <TableHead>System Qty</TableHead>
                <TableHead className="w-[180px]">Physical Count</TableHead>
                <TableHead>Difference</TableHead>
                {isPosted && <TableHead>Valuation Diff</TableHead>}
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLines.map((line) => {
                const ing = line.ingredient as any;
                const sys = Number(line.systemQty) || 0;
                // Priority: Local count > Saved count > null
                const local = counts[line._id];
                const counted = local !== undefined ? local : line.countedQty !== null ? line.countedQty : null;

                const hasCount = counted !== null;
                const diff = hasCount ? counted - sys : 0;
                const isWarning = hasCount && Math.abs(diff) > 0.001;

                return (
                  <TableRow key={line._id} className={isWarning && !isPosted ? "bg-amber-500/5" : ""}>
                    <TableCell>
                      <div className="font-medium">{ing.name}</div>
                      <div className="text-muted-foreground text-xs">
                        {ing.sku || "No SKU"} • {ing.unit}
                      </div>
                    </TableCell>
                    {showBinColumn ? (
                      <TableCell className="text-muted-foreground max-w-[140px] truncate text-sm">
                        {binLabel(line.bin)}
                      </TableCell>
                    ) : null}
                    <TableCell className="font-mono">
                      {session.blindCount && !isPosted ? (
                        <div className="flex items-center gap-1.5 text-muted-foreground/50">
                          <EyeOff className="size-3" />
                          <span>Hidden</span>
                        </div>
                      ) : (
                        sys.toFixed(2)
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          className="h-8 font-mono"
                          disabled={isPosted}
                          placeholder="0.00"
                          value={local !== undefined ? local : (line.countedQty ?? "")}
                          onChange={(e) => handleCountChange(line._id, e.target.value)}
                        />
                        <span className="text-muted-foreground text-xs">{ing.unit}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {session.blindCount && !isPosted ? (
                        <span className="text-muted-foreground/30">—</span>
                      ) : hasCount ? (
                        <span className={diff > 0 ? "text-green-600" : diff < 0 ? "text-destructive" : ""}>
                          {diff > 0 ? "+" : ""}
                          {diff.toFixed(2)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    {isPosted && (
                      <TableCell className="font-mono text-sm">
                        <span
                          className={
                            (line.varianceValue || 0) > 0
                              ? "text-green-600"
                              : (line.varianceValue || 0) < 0
                                ? "text-destructive"
                                : ""
                          }
                        >
                          {(line.varianceValue || 0).toFixed(2)}
                        </span>
                      </TableCell>
                    )}
                    <TableCell>
                      {isWarning ? (
                        <Badge variant="outline" className="gap-1 border-amber-500/50 text-[10px] text-amber-600">
                          <AlertTriangle className="h-3 w-3" /> Correction
                        </Badge>
                      ) : hasCount ? (
                        <Badge variant="outline" className="gap-1 border-green-500/50 text-[10px] text-green-600">
                          <CheckCircle2 className="h-3 w-3" /> Exact
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {!isPosted && (
        <div className="flex justify-end gap-3 text-muted-foreground text-sm">
          <div className="flex items-center gap-1.5">
            <Save className="h-3.5 w-3.5" /> Save frequently to prevent data loss.
          </div>
          <div className="flex items-center gap-1.5">
            <Send className="h-3.5 w-3.5" /> Finalizing updates inventory balances.
          </div>
        </div>
      )}

      <AlertDialog open={isFinalizeDialogOpen} onOpenChange={setIsFinalizeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finalize this session?</AlertDialogTitle>
            <AlertDialogDescription>
              This will adjust system stock levels to match your counts. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isFinalizing || saveMutation.isPending || postMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleConfirmPost()}
              disabled={isFinalizing || saveMutation.isPending || postMutation.isPending}
            >
              {isFinalizing || saveMutation.isPending || postMutation.isPending ? "Finalizing..." : "Yes, finalize"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
