"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, ChevronLeft, ChevronRight, Copy, KeyRound, MoreHorizontal } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import LicenseStatusBadge from "@/components/license-status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { LicenseRow, LicenseStatus } from "@/types/license";
import { format } from "date-fns";

function productLabel(p: string): string {
  if (p === "pos_desktop") return "POS Desktop";
  if (p === "bundle") return "Bundle";
  return "Platform";
}

export type LicenseTableProps = {
  listLoading: boolean;
  licenses: LicenseRow[];
  anyFilter: boolean;
  onClearFilters: () => void;
  canGenerateLicenses: boolean;
  onOpenGenerate: () => void;
  copied: string | null;
  onCopyKey: (key: string) => void;
  onAssignLicense: (row: LicenseRow) => void;
  onRevokeLicense: (row: LicenseRow) => void;
  from: number;
  to: number;
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
};

export function LicenseTable({
  listLoading,
  licenses,
  anyFilter,
  onClearFilters,
  canGenerateLicenses,
  onOpenGenerate,
  copied,
  onCopyKey,
  onAssignLicense,
  onRevokeLicense,
  from,
  to,
  total,
  page,
  pageSize,
  onPageChange,
}: LicenseTableProps) {
  const router = useRouter();

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>License key</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Tenant</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Activations</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead className="w-[70px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {listLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : licenses.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="p-0">
                  <EmptyState
                    icon={KeyRound}
                    title={anyFilter ? "No results match your filters" : "No licenses found"}
                    description={
                      anyFilter
                        ? "Try clearing filters or adjusting your search."
                        : "Generate a license to assign it to tenants."
                    }
                    action={
                      anyFilter ? (
                        <Button variant="outline" onClick={onClearFilters}>
                          Clear filters
                        </Button>
                      ) : canGenerateLicenses ? (
                        <Button onClick={onOpenGenerate}>Generate your first license</Button>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Ask a super admin to generate the first license.
                        </p>
                      )
                    }
                    className="border-0 bg-transparent"
                  />
                </TableCell>
              </TableRow>
            ) : (
              licenses.map((row) => (
                <TableRow key={row.id} className="group">
                  <TableCell>
                    <div className="flex items-center gap-1 font-mono text-xs">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-auto max-w-[140px] truncate p-0 text-left font-mono text-xs hover:bg-transparent hover:underline sm:max-w-[180px]"
                        title="Click to copy"
                        onClick={() => void onCopyKey(row.licenseKey)}
                      >
                        {row.licenseKey}
                      </Button>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0 opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-100"
                              onClick={() => void onCopyKey(row.licenseKey)}
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                          }
                        />
                        <TooltipContent>
                          {copied === row.licenseKey ? "Copied!" : "Copy"}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{productLabel(row.product)}</Badge>
                  </TableCell>
                  <TableCell className="capitalize">{row.planSlug}</TableCell>
                  <TableCell>
                    {row.tenantId ? (
                      <Link
                        href={`/tenants/${row.tenantId}`}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        {row.tenantName ?? row.tenantSlug}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <LicenseStatusBadge status={row.status as LicenseStatus} />
                  </TableCell>
                  <TableCell>
                    {row.product === "platform" ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span className="tabular-nums text-sm">
                        {row.activationCount} / {row.maxActivations}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {row.isPerpetual ? (
                      <Badge variant="secondary">Perpetual</Badge>
                    ) : row.expiresAt ? (
                      format(new Date(row.expiresAt), "PP")
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label="License actions"
                          />
                        }
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => router.push(`/licenses/${row.id}`)}>
                          View details
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {canGenerateLicenses && row.status === "unassigned" ? (
                          <DropdownMenuItem onClick={() => onAssignLicense(row)}>
                            Assign to tenant
                          </DropdownMenuItem>
                        ) : null}
                        {canGenerateLicenses && row.status !== "revoked" ? (
                          <>
                            {row.status === "unassigned" ? <DropdownMenuSeparator /> : null}
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => onRevokeLicense(row)}
                            >
                              <Ban className="mr-2 h-4 w-4" />
                              Revoke license
                            </DropdownMenuItem>
                          </>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {from}–{to} of {total} licenses
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(Math.max(1, page - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page * pageSize >= total}
            onClick={() => onPageChange(page + 1)}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </>
  );
}
