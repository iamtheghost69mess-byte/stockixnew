"use client";

import { cn } from "@/lib/utils";

type ReportCompareTableRow = {
  readonly label: string;
  readonly current: number;
  readonly compare: number;
};

type ReportCompareTableProps = {
  readonly rows: readonly ReportCompareTableRow[];
};

function calcPercentChange(current: number, compare: number): number {
  if (compare === 0) return current > 0 ? 100 : 0;
  return ((current - compare) / compare) * 100;
}

export function ReportCompareTable({ rows }: ReportCompareTableProps) {
  return (
    <div className="overflow-hidden rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Metric</th>
            <th className="px-3 py-2 text-right font-medium">Current</th>
            <th className="px-3 py-2 text-right font-medium">Compare</th>
            <th className="px-3 py-2 text-right font-medium">% Change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const change = calcPercentChange(row.current, row.compare);
            return (
              <tr key={row.label} className="border-t">
                <td className="px-3 py-2">{row.label}</td>
                <td className="px-3 py-2 text-right">{row.current.toFixed(2)}</td>
                <td className="px-3 py-2 text-right">{row.compare.toFixed(2)}</td>
                <td
                  className={cn(
                    "px-3 py-2 text-right font-medium",
                    change >= 0 ? "text-emerald-600" : "text-red-600"
                  )}
                >
                  {change.toFixed(2)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
