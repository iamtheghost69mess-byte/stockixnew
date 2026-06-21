export type ReportExcelExportColumn = {
  readonly key: string;
  readonly label: string;
};

export type ReportExcelExportOptions = {
  readonly fileName: string;
  readonly branchName: string;
  readonly dateRange: string;
  readonly columns: readonly ReportExcelExportColumn[];
  readonly rows: readonly Record<string, string | number | null | undefined>[];
  readonly totals?: readonly (string | number)[];
};

function csvCell(value: string | number | null | undefined): string {
  const raw = String(value ?? "");
  const escaped = raw.replace(/"/g, "\"\"");
  return `"${escaped}"`;
}

export function exportReportExcel(options: ReportExcelExportOptions): void {
  const lines: string[] = [];
  lines.push([csvCell("Branch"), csvCell(options.branchName)].join(","));
  lines.push([csvCell("Date Range"), csvCell(options.dateRange)].join(","));
  lines.push("");
  lines.push(options.columns.map((column) => csvCell(column.label)).join(","));
  for (const row of options.rows) {
    lines.push(options.columns.map((column) => csvCell(row[column.key])).join(","));
  }
  if (options.totals && options.totals.length > 0) {
    lines.push(options.totals.map((entry) => csvCell(entry)).join(","));
  }
  const blob = new Blob([lines.join("\n")], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=utf-8;",
  });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = options.fileName.endsWith(".xlsx") ? options.fileName : `${options.fileName}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
