"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { posApiFetch } from "@/lib/pos-fetch";
import { formatPosCell, parsePosListRows, rowId } from "@/lib/pos-list-utils";

export type PosColumn = {
  key: string;
  label: string;
  mono?: boolean;
  render?: (value: unknown, row: Record<string, unknown>) => React.ReactNode;
};

type PosResourceTableProps = {
  title: string;
  fetchPath: string;
  listKeys: string[];
  columns: PosColumn[];
  emptyMessage?: string;
};

export function PosResourceTable({
  title,
  fetchPath,
  listKeys,
  columns,
  emptyMessage = "No records found.",
}: PosResourceTableProps) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await posApiFetch(fetchPath);
        const data = await res.json();
        if (!res.ok) {
          if (!cancelled) {
            setError(typeof data === "object" ? JSON.stringify(data) : `HTTP ${res.status}`);
            setRows([]);
          }
          return;
        }
        if (!cancelled) {
          setRows(parsePosListRows(data, listKeys));
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchPath, listKeys.join(",")]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {error ? <p className="mb-3 text-sm text-destructive">{error}</p> : null}
        {loading ? (
          <Skeleton className="h-32 w-full" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((col) => (
                  <TableHead key={col.key}>{col.label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, index) => (
                <TableRow key={rowId(row, index)}>
                  {columns.map((col) => {
                    const value = row[col.key];
                    return (
                      <TableCell
                        key={col.key}
                        className={col.mono ? "font-mono text-xs" : undefined}
                      >
                        {col.render ? (
                          col.render(value, row)
                        ) : (
                          formatPosCell(value)
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
