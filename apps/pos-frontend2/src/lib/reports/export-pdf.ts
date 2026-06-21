export type ReportPdfExportColumn = {
  readonly key: string;
  readonly label: string;
};

export type ReportPdfExportOptions = {
  readonly fileName: string;
  readonly title: string;
  readonly branchName: string;
  readonly dateRange: string;
  readonly logoUrl?: string;
  readonly generatedAt?: Date;
  readonly columns: readonly ReportPdfExportColumn[];
  readonly rows: readonly Record<string, string | number | null | undefined>[];
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function exportReportPdf(options: ReportPdfExportOptions): void {
  const generatedAt = options.generatedAt ?? new Date();
  const header = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <div>
        <h1 style="margin:0 0 4px;font-size:20px;">${escapeHtml(options.title)}</h1>
        <div style="font-size:12px;color:#555;">Branch: ${escapeHtml(options.branchName)}</div>
        <div style="font-size:12px;color:#555;">Date range: ${escapeHtml(options.dateRange)}</div>
        <div style="font-size:12px;color:#555;">Generated: ${escapeHtml(generatedAt.toISOString())}</div>
      </div>
      ${options.logoUrl ? `<img src="${escapeHtml(options.logoUrl)}" alt="logo" style="max-height:40px;object-fit:contain;" />` : ""}
    </div>
  `;
  const thead = `<tr>${options.columns
    .map((column) => `<th style="text-align:left;border-bottom:1px solid #ddd;padding:6px;">${escapeHtml(column.label)}</th>`)
    .join("")}</tr>`;
  const tbody = options.rows
    .map((row) => {
      const cells = options.columns
        .map((column) => `<td style="border-bottom:1px solid #f0f0f0;padding:6px;">${escapeHtml(String(row[column.key] ?? ""))}</td>`)
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
  const html = `
    <!doctype html>
    <html>
      <head><meta charset="utf-8" /><title>${escapeHtml(options.fileName)}</title></head>
      <body style="font-family:Arial,sans-serif;padding:24px;">
        ${header}
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead>${thead}</thead>
          <tbody>${tbody}</tbody>
        </table>
      </body>
    </html>
  `;
  const printWindow = window.open("", "_blank", "noopener,noreferrer");
  if (!printWindow) return;
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}
