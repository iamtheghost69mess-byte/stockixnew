"use client";

import { Download, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type LicenseFiltersProps = {
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  productFilter: string;
  onProductFilterChange: (value: string) => void;
  planFilter: string;
  onPlanFilterChange: (value: string) => void;
  planOptions: Array<{ slug: string; name: string }>;
  expiring30: boolean;
  onExpiring30Toggle: () => void;
  anyFilter: boolean;
  onClearFilters: () => void;
  onExport: () => void;
};

export function LicenseFilters({
  searchInput,
  onSearchInputChange,
  statusFilter,
  onStatusFilterChange,
  productFilter,
  onProductFilterChange,
  planFilter,
  onPlanFilterChange,
  planOptions,
  expiring30,
  onExpiring30Toggle,
  anyFilter,
  onClearFilters,
  onExport,
}: LicenseFiltersProps) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="relative min-w-[200px] flex-1">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Search key or tenant…"
          value={searchInput}
          onChange={(e) => onSearchInputChange(e.target.value)}
        />
      </div>
      <Select value={statusFilter} onValueChange={(v) => onStatusFilterChange(v ?? "all")}>
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="unassigned">Unassigned</SelectItem>
          <SelectItem value="revoked">Revoked</SelectItem>
          <SelectItem value="expired">Expired</SelectItem>
        </SelectContent>
      </Select>
      <Select value={productFilter} onValueChange={(v) => onProductFilterChange(v ?? "all")}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Product" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All products</SelectItem>
          <SelectItem value="platform">Platform</SelectItem>
          <SelectItem value="pos_desktop">POS Desktop</SelectItem>
          <SelectItem value="bundle">Bundle</SelectItem>
        </SelectContent>
      </Select>
      <Select value={planFilter} onValueChange={(v) => onPlanFilterChange(v ?? "all")}>
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Plan" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All plans</SelectItem>
          {planOptions.map((p) => (
            <SelectItem key={p.slug} value={p.slug}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        variant={expiring30 ? "default" : "outline"}
        className={expiring30 ? "bg-amber-600 hover:bg-amber-600" : ""}
        onClick={onExpiring30Toggle}
      >
        Expiring in 30 days
      </Button>
      {anyFilter ? (
        <Button type="button" variant="ghost" onClick={onClearFilters}>
          Clear filters
        </Button>
      ) : null}
      <Button type="button" variant="outline" size="sm" onClick={onExport}>
        <Download className="mr-2 h-4 w-4" />
        Export CSV
      </Button>
    </div>
  );
}
