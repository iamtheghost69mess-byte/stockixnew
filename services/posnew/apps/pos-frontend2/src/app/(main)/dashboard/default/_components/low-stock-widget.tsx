"use client";

import Link from "next/link";

import { CheckCircle2 } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardLowStockRow } from "@/lib/pos-dashboard-api";

type LowStockWidgetProps = {
  readonly rows: DashboardLowStockRow[];
  readonly isLoading: boolean;
};

export function LowStockWidget({ rows, isLoading }: LowStockWidgetProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Low stock alerts</CardTitle>
        <CardDescription>Ingredients at or below minimum stock level.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading low stock alerts...</p>
        ) : rows.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-emerald-600">
            <CheckCircle2 className="h-4 w-4" />
            All stock levels OK
          </p>
        ) : (
          <div className="space-y-2">
            {rows.map((row) => (
              <Link
                key={row.ingredientId}
                href={`/dashboard/ingredients?ingredientId=${encodeURIComponent(row.ingredientId)}`}
                className="flex items-center justify-between rounded border px-3 py-2 text-sm hover:bg-muted"
              >
                <span className="font-medium">{row.ingredientName || "Unnamed ingredient"}</span>
                <span className="text-muted-foreground">
                  {row.currentStock} / {row.minStock} {row.unit || ""}
                </span>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
