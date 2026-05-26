"use client";

import { CheckCircle2, Circle, LayoutList, MoreHorizontal, Pencil, Power } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import type { PlanRow } from "./plans-utils";
import { planPriceLabel } from "./plans-utils";

export function PlanList({
  plans,
  listLoading,
  onEdit,
  onDeactivate,
}: {
  plans: PlanRow[];
  listLoading: boolean;
  onEdit: (row: PlanRow) => void;
  onDeactivate: (row: PlanRow) => void;
}) {
  return (
    <div className="rounded-xl border border-border/80 bg-card shadow-sm">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[100px]">Sort</TableHead>
            <TableHead>Name</TableHead>
            <TableHead className="min-w-[120px]">Slug</TableHead>
            <TableHead>Price</TableHead>
            <TableHead className="text-right">Max orgs</TableHead>
            <TableHead className="text-right">Activations</TableHead>
            <TableHead className="text-right">Max users</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-[60px] text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {listLoading && plans.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                Loading…
              </TableCell>
            </TableRow>
          ) : null}
          {!listLoading && plans.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="p-0">
                <EmptyState
                  icon={LayoutList}
                  title="No plans yet"
                  description="Create a plan to use it in license and tenant flows."
                  className="border-0 bg-transparent"
                />
              </TableCell>
            </TableRow>
          ) : null}
          {plans.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="text-muted-foreground">{row.sortOrder}</TableCell>
              <TableCell className="font-medium">{row.name}</TableCell>
              <TableCell className="font-mono text-sm">{row.slug}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{planPriceLabel(row)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {row.maxOrganizations === -1 ? "Unlimited" : row.maxOrganizations}
              </TableCell>
              <TableCell className="text-right tabular-nums">{row.maxActivations}</TableCell>
              <TableCell className="text-right tabular-nums">{row.maxUsers}</TableCell>
              <TableCell>
                {row.isActive ? (
                  <Badge className="gap-1 border-emerald-600/30 bg-emerald-600/15 text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Active
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="gap-1">
                    <Circle className="h-3.5 w-3.5" />
                    Inactive
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Plan actions" />
                    }
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEdit(row)}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit plan
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!row.isActive || row.activeLicenseCount > 0}
                      title={
                        row.activeLicenseCount > 0
                          ? "Cannot deactivate while active licenses use this plan."
                          : !row.isActive
                            ? "Plan is already inactive."
                            : undefined
                      }
                      onClick={() => onDeactivate(row)}
                    >
                      <Power className="mr-2 h-4 w-4" />
                      Deactivate
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
