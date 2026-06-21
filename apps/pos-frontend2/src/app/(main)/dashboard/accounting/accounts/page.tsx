"use client";

import { useMemo, useState } from "react";

import Link from "next/link";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, FileText, Pencil, Plus, Search, Settings2 } from "lucide-react";

import { AccountFormDialog } from "@/app/(main)/dashboard/accounting/_components/account-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ACCOUNT_TYPES, type PosAccount, posFetchAccounts, posFetchBalanceSheet } from "@/lib/pos-accounting-api";
import { posCan } from "@/lib/pos-permissions";
import { formatCurrency } from "@/lib/utils";
import { usePosAuthStore } from "@/stores/pos-auth-store";

export default function ChartOfAccountsPage() {
  const permissions = usePosAuthStore((s) => s.user?.permissions ?? []);
  const canWrite = posCan(permissions, "backoffice.accounting.write");
  const canGlRead = posCan(permissions, "backoffice.accounting.gl.read");

  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const queryParams = useMemo(() => {
    const p: { type?: string; active?: "true" | "false" } = {};
    if (typeFilter !== "all") p.type = typeFilter;
    if (activeFilter === "active") p.active = "true";
    if (activeFilter === "inactive") p.active = "false";
    return p;
  }, [typeFilter, activeFilter]);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["accounting", "accounts", queryParams],
    queryFn: () => posFetchAccounts(queryParams),
  });

  const asOfToday = format(new Date(), "yyyy-MM-dd");
  const { data: balanceSheet, isLoading: balanceSheetLoading } = useQuery({
    queryKey: ["accounting", "balance-sheet-kpi", asOfToday],
    queryFn: () => posFetchBalanceSheet({ asOf: asOfToday }),
    enabled: canGlRead,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(
      (a) => a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) || a.type.toLowerCase().includes(q),
    );
  }, [accounts, search]);

  const [createOpen, setCreateOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<PosAccount | null>(null);

  const totalAssets = accounts
    .filter((a) => a.type === "asset" || a.type === "bank")
    .reduce((s, a) => s + (a.balance || 0), 0);
  const totalLiabilities = accounts
    .filter((a) => a.type === "liability")
    .reduce((s, a) => s + Math.abs(a.balance || 0), 0);

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" className="mb-1 -ml-2" asChild>
        <Link href="/dashboard/accounting">
          <ArrowLeft className="mr-2 size-4" />
          Accounting overview
        </Link>
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-bold text-3xl tracking-tight">Chart of Accounts</h1>
          <p className="text-muted-foreground">Monitor your general ledger, asset accounts, and liabilities.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canGlRead ? (
            <Button variant="outline" asChild>
              <Link href="/dashboard/accounting/ledger">Entries</Link>
            </Button>
          ) : null}
          {canGlRead ? (
            <Button variant="outline" asChild>
              <Link href="/dashboard/accounting/trial-balance">Trial balance</Link>
            </Button>
          ) : null}
          <Button variant="outline" asChild>
            <Link href="/dashboard/accounting/settings">
              <Settings2 className="mr-2 h-4 w-4" /> GL settings
            </Link>
          </Button>
          {canWrite ? (
            <Button type="button" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> New account
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button type="button" disabled>
                    <Plus className="mr-2 h-4 w-4" /> New account
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                Requires <span className="font-mono">backoffice.accounting.write</span>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <CardDescription className="font-bold text-[10px] uppercase tracking-wider">Total assets</CardDescription>
            <CardTitle className="text-2xl">{formatCurrency(totalAssets)}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-destructive/20 bg-destructive/5">
          <CardHeader className="pb-2">
            <CardDescription className="font-bold text-[10px] uppercase tracking-wider">
              Total liabilities
            </CardDescription>
            <CardTitle className="text-2xl">{formatCurrency(totalLiabilities)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="font-bold text-[10px] uppercase tracking-wider">Total equity</CardDescription>
            {canGlRead ? (
              balanceSheetLoading ? (
                <Skeleton className="mt-1 h-9 w-40" />
              ) : balanceSheet != null ? (
                <>
                  <CardTitle className="text-2xl">{formatCurrency(balanceSheet.totalEquity)}</CardTitle>
                  <p className="pt-1 text-muted-foreground text-xs">
                    From balance sheet as of {balanceSheet.asOf ?? asOfToday}.{" "}
                    <Link
                      href="/dashboard/accounting/balance-sheet"
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      Open report
                    </Link>
                  </p>
                </>
              ) : (
                <CardTitle className="font-normal text-base text-muted-foreground leading-snug">
                  Balance sheet unavailable.{" "}
                  <Link
                    href="/dashboard/accounting/balance-sheet"
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    Retry
                  </Link>
                </CardTitle>
              )
            ) : (
              <CardTitle className="font-normal text-base text-muted-foreground leading-snug">
                Total equity is on the balance sheet. Grant{" "}
                <span className="font-mono text-xs">backoffice.accounting.gl.read</span> to see it here.
              </CardTitle>
            )}
          </CardHeader>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search code or name…"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search accounts"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {ACCOUNT_TYPES.map((t) => (
              <SelectItem key={t} value={t} className="capitalize">
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={activeFilter} onValueChange={setActiveFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active only</SelectItem>
            <SelectItem value="inactive">Inactive only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle>Accounts</CardTitle>
            <CardDescription>All categorized accounts in the general ledger.</CardDescription>
          </div>
          {canGlRead ? (
            <Button type="button" variant="ghost" size="sm" asChild>
              <Link href="/dashboard/accounting/exports">
                <FileText className="mr-2 h-4 w-4" /> Exports
              </Link>
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button type="button" variant="ghost" size="sm" disabled>
                    <FileText className="mr-2 h-4 w-4" /> Exports
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                Journal CSV &amp; integration JSON require <span className="font-mono">gl.read</span>
              </TooltipContent>
            </Tooltip>
          )}
        </CardHeader>
        <div className="px-6 pb-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Code</TableHead>
                <TableHead>Account name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={`sk-${i}`}>
                    <TableCell>
                      <Skeleton className="h-4 w-12" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-40" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Skeleton className="ml-auto h-4 w-20" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Skeleton className="ml-auto h-8 w-16" />
                    </TableCell>
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    No accounts match your filters.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((account) => (
                  <TableRow key={account._id}>
                    <TableCell className="font-mono text-xs">{account.code}</TableCell>
                    <TableCell className="font-medium">{account.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {account.type}
                      </Badge>
                      {account.isActive === false ? (
                        <span className="ml-2 text-muted-foreground text-xs">Inactive</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(account.balance || 0)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {canGlRead ? (
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/dashboard/accounting/accounts/${account._id}`}>Register</Link>
                          </Button>
                        ) : (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex">
                                <Button variant="ghost" size="sm" disabled>
                                  Register
                                </Button>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              Requires <span className="font-mono">backoffice.accounting.gl.read</span>
                            </TooltipContent>
                          </Tooltip>
                        )}
                        {canWrite ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditAccount(account)}
                            aria-label={`Edit ${account.name}`}
                          >
                            <Pencil className="size-4" />
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <AccountFormDialog open={createOpen} onOpenChange={setCreateOpen} mode="create" />
      <AccountFormDialog
        open={editAccount != null}
        onOpenChange={(o) => !o && setEditAccount(null)}
        mode="edit"
        account={editAccount}
      />
    </div>
  );
}
