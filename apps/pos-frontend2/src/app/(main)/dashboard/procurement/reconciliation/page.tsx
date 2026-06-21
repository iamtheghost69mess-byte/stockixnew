"use client";

import { useState } from "react";

import Link from "next/link";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Filter,
  History,
  Search,
  ShieldCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchReconciliationMatches, RECONCILIATION_QUERY_KEY } from "@/lib/pos-reconciliation-api";

export default function ReconciliationPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data: matchesRes, isLoading } = useQuery({
    queryKey: [RECONCILIATION_QUERY_KEY, statusFilter],
    queryFn: () =>
      fetchReconciliationMatches({
        status: statusFilter === "all" ? undefined : statusFilter,
      }),
  });

  const matches = matchesRes?.data || [];

  const filteredMatches = matches.filter(
    (m: any) =>
      m.purchaseOrder.reference.toLowerCase().includes(search.toLowerCase()) ||
      m.vendorBill.vendorBillNumber.toLowerCase().includes(search.toLowerCase()),
  );

  const stats = {
    total: matches.length,
    matched: matches.filter((m: any) => m.matchStatus === "matched").length,
    mismatched: matches.filter((m: any) => ["quantity_mismatch", "price_mismatch"].includes(m.matchStatus)).length,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-bold text-3xl tracking-tight">3-Way Match HUB</h1>
          <p className="mt-1 text-muted-foreground">
            Reconcile Purchase Orders, Goods Receipts, and Vendor Bills to ensure financial accuracy.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">Reconciliation Accuracy</CardTitle>
            <ShieldCheck className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">
              {stats.total > 0 ? Math.round((stats.matched / stats.total) * 100) : 0}%
            </div>
            <p className="text-muted-foreground text-xs">Overall match rate across all sessions</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">Pending Auditor Review</CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl text-amber-500">{stats.mismatched}</div>
            <p className="text-muted-foreground text-xs">Sessions flagging price or quantity gaps</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">Total Audited</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">{stats.matched}</div>
            <p className="text-muted-foreground text-xs">Sessions that passed the 3-Way Match check</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="relative min-w-[300px] flex-1">
          <Search className="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search PO or Bill number..."
            className="bg-card pl-8 shadow-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px] bg-card shadow-sm">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="matched">Matched</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="quantity_mismatch">Qty Mismatch</SelectItem>
              <SelectItem value="price_mismatch">Price Mismatch</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="w-[150px]">PO Reference</TableHead>
              <TableHead>Vendor Bill</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Audit</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-32" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-6 w-20" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                  <TableCell className="text-right">
                    <Skeleton className="ml-auto h-8 w-8" />
                  </TableCell>
                </TableRow>
              ))
            ) : filteredMatches.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <History className="h-8 w-8 opacity-20" />
                    <p>No reconciliation records found for the current filters.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredMatches.map((match: any) => (
                <TableRow key={match._id} className="transition-colors hover:bg-muted/30">
                  <TableCell className="font-medium">{match.purchaseOrder.reference}</TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span>{match.vendorBill.vendorBillNumber}</span>
                      <span className="text-muted-foreground text-xs">
                        Total: ${match.vendorBill.total.toLocaleString()}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <MatchStatusBadge status={match.matchStatus} />
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {format(new Date(match.lastMatchedAt), "MMM d, yyyy HH:mm")}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/dashboard/procurement/reconciliation/${match._id}`}>
                        View Comparison <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function MatchStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "matched":
      return (
        <Badge variant="outline" className="gap-1.5 border-emerald-200 bg-emerald-50 py-1 text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" /> Matched
        </Badge>
      );
    case "quantity_mismatch":
      return (
        <Badge variant="outline" className="gap-1.5 border-amber-200 bg-amber-50 py-1 text-amber-700">
          <AlertCircle className="h-3.5 w-3.5" /> Qty Mismatch
        </Badge>
      );
    case "price_mismatch":
      return (
        <Badge variant="outline" className="gap-1.5 border-destructive/20 bg-destructive/5 py-1 text-destructive">
          <AlertTriangle className="h-3.5 w-3.5" /> Price Mismatch
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary" className="gap-1.5 py-1">
          Pending
        </Badge>
      );
  }
}
