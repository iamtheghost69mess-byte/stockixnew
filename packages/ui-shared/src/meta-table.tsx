import * as React from "react";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@repo/ui-core";

export interface MetaTableColumn {
  key: string;
  label: string;
  renderCell?: (value: any, row: any) => React.ReactNode;
}

export interface MetaTableProps {
  columns: MetaTableColumn[];
  data: any[];
}

export function MetaTable({ columns, data }: MetaTableProps) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead key={col.key}>{col.label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="text-center h-24">
                No data available.
              </TableCell>
            </TableRow>
          ) : (
            data.map((row, i) => (
              <TableRow key={row.id || i}>
                {columns.map((col) => (
                  <TableCell key={col.key}>
                    {col.renderCell ? col.renderCell(row[col.key], row) : row[col.key]}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
