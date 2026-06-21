/**
 * Professional PDF reports for accounting exports (PDFKit).
 * Sets PDF document metadata (Title, Author, Subject, Keywords, CreationDate).
 */
const PDFDocument = require("pdfkit");

function fmtMoney(n) {
  const x = Number(n) || 0;
  return x.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtDateIso(d) {
  if (!d) return "—";
  try {
    const x = new Date(d);
    if (Number.isNaN(x.getTime())) return "—";
    return x.toISOString().slice(0, 10);
  } catch {
    return "—";
  }
}

/**
 * @param {object} tb - trial balance from accountingService.trialBalance
 * @param {object} opts
 * @param {string} [opts.orgName]
 * @param {string} [opts.periodStart]
 * @param {string} [opts.periodEnd]
 * @returns {Promise<Buffer>}
 */
function trialBalanceToPdfBuffer(tb, opts = {}) {
  const orgName = opts.orgName || "";
  const periodStart = opts.periodStart || "";
  const periodEnd = opts.periodEnd || "";
  const generatedAt = new Date();

  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({
      margin: 48,
      size: "LETTER",
      bufferPages: true,
      info: {
        Title: "Trial Balance",
        Author: "POS Accounting",
        Subject: "General ledger trial balance report",
        Keywords: "accounting, trial balance, general ledger, POS",
        CreationDate: generatedAt,
        ModDate: generatedAt,
        Creator: "Restaurant POS / pdfkit",
      },
    });

    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const w = right - left;
    let y = doc.y;

    doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(22).text("Trial balance", left, y, { width: w });
    y = doc.y + 6;
    doc.font("Helvetica").fontSize(10).fillColor("#475569");
    if (orgName) {
      doc.text(orgName, left, y, { width: w });
      y = doc.y + 2;
    }
    const periodLine =
      periodStart || periodEnd
        ? `Period: ${periodStart || "—"} through ${periodEnd || "—"}`
        : "Period: all dates (no range filter)";
    doc.text(periodLine, left, y, { width: w });
    y = doc.y + 2;
    doc.text(`Generated (UTC): ${generatedAt.toISOString().replace("T", " ").slice(0, 19)}`, left, y, {
      width: w,
    });
    y = doc.y + 16;

    doc.strokeColor("#0f172a").lineWidth(1).moveTo(left, y).lineTo(right, y).stroke();
    y += 12;

    const colCode = left;
    const colName = left + 58;
    const colDr = right - 168;
    const colCr = right - 108;
    const colBal = right - 48;

    doc.font("Helvetica-Bold").fontSize(9).fillColor("#0f172a");
    doc.text("Code", colCode, y, { width: 52 });
    doc.text("Account", colName, y, { width: colDr - colName - 8 });
    doc.text("Debit", colDr, y, { width: 56, align: "right" });
    doc.text("Credit", colCr, y, { width: 56, align: "right" });
    doc.text("Balance", colBal, y, { width: 56, align: "right" });
    y += 14;
    doc.strokeColor("#cbd5e1").lineWidth(0.5).moveTo(left, y).lineTo(right, y).stroke();
    y += 8;

    const rows = tb.rows || [];
    const lineHeight = 13;
    const bottom = doc.page.height - doc.page.margins.bottom - 36;

    doc.font("Helvetica").fontSize(9);
    for (const r of rows) {
      if (y + lineHeight > bottom) {
        doc.addPage();
        y = doc.page.margins.top;
        doc.font("Helvetica-Bold").fontSize(9).fillColor("#64748b").text("Trial balance (continued)", left, y);
        y = doc.y + 10;
        doc.font("Helvetica").fillColor("#222");
      }
      doc.fillColor("#1e293b");
      doc.text(String(r.code ?? ""), colCode, y, { width: 52 });
      doc.text(String(r.name ?? ""), colName, y, { width: colDr - colName - 8, ellipsis: true });
      doc.text(fmtMoney(r.debit), colDr, y, { width: 56, align: "right" });
      doc.text(fmtMoney(r.credit), colCr, y, { width: 56, align: "right" });
      doc.text(fmtMoney(r.balance), colBal, y, { width: 56, align: "right" });
      y += lineHeight;
    }

    y += 8;
    doc.strokeColor("#0f172a").lineWidth(1).moveTo(left, y).lineTo(right, y).stroke();
    y += 10;

    doc.font("Helvetica-Bold").fontSize(10).fillColor("#0f172a");
    doc.text(`Total debits: ${fmtMoney(tb.totalDebit)}`, left, y);
    y = doc.y + 4;
    doc.text(`Total credits: ${fmtMoney(tb.totalCredit)}`, left, y);
    y = doc.y + 4;
    const ok = Boolean(tb.balanced);
    doc.fillColor(ok ? "#15803d" : "#b91c1c").text(ok ? "Balanced" : "Not balanced", left, y);

    const range = doc.bufferedPageRange();
    const startPage = range.start;
    const count = range.count;
    for (let i = 0; i < count; i += 1) {
      doc.switchToPage(startPage + i);
      doc.font("Helvetica").fontSize(8).fillColor("#94a3b8");
      doc.text(
        `Trial balance · Page ${i + 1} of ${count}`,
        left,
        doc.page.height - doc.page.margins.bottom + 8,
        { width: w, align: "center" },
      );
    }

    doc.end();
  });
}

/**
 * @param {object[]} entries - journal entries (lean, lines populated)
 * @param {object} opts
 * @param {string} [opts.orgName]
 * @param {string} [opts.periodStart]
 * @param {string} [opts.periodEnd]
 * @returns {Promise<Buffer>}
 */
function journalsToPdfBuffer(entries, opts = {}) {
  const orgName = opts.orgName || "";
  const periodStart = opts.periodStart || "";
  const periodEnd = opts.periodEnd || "";
  const generatedAt = new Date();

  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({
      margin: 48,
      size: "LETTER",
      bufferPages: true,
      info: {
        Title: "Journal export",
        Author: "POS Accounting",
        Subject: "General ledger journal entries",
        Keywords: "accounting, journal, GL export, POS",
        CreationDate: generatedAt,
        ModDate: generatedAt,
        Creator: "Restaurant POS / pdfkit",
      },
    });

    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const w = right - left;
    let y = doc.y;

    doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(22).text("Journal export", left, y, { width: w });
    y = doc.y + 6;
    doc.font("Helvetica").fontSize(10).fillColor("#475569");
    if (orgName) {
      doc.text(orgName, left, y, { width: w });
      y = doc.y + 2;
    }
    doc.text(
      periodStart || periodEnd
        ? `Entry dates: ${periodStart || "—"} through ${periodEnd || "—"}`
        : "Entry dates: all (no range filter)",
      left,
      y,
      { width: w },
    );
    y = doc.y + 2;
    doc.text(`Entries shown: ${entries.length} · Generated (UTC): ${generatedAt.toISOString().replace("T", " ").slice(0, 19)}`, left, y, {
      width: w,
    });
    y = doc.y + 14;

    const bottom = doc.page.height - doc.page.margins.bottom - 36;
    const lineSmall = 11;

    for (const e of entries) {
      const headerH = 52;
      if (y + headerH > bottom) {
        doc.addPage();
        y = doc.page.margins.top;
        doc.font("Helvetica-Bold").fontSize(9).fillColor("#64748b").text("Journal export (continued)", left, y);
        y = doc.y + 10;
      }

      doc.strokeColor("#e2e8f0").lineWidth(0.5).moveTo(left, y).lineTo(right, y).stroke();
      y += 8;
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#0f172a");
      doc.text(`Entry #${e.entryNumber} · ${e.sourceType || "—"}`, left, y, { width: w * 0.65 });
      doc.font("Helvetica").fontSize(9).fillColor("#64748b");
      doc.text(fmtDateIso(e.entryDate), left + w * 0.65, y, { width: w * 0.35, align: "right" });
      y = doc.y + 2;
      doc.font("Helvetica").fontSize(8).fillColor("#475569");
      doc.text((e.memo || "").slice(0, 200) || "—", left, y, { width: w });
      y = doc.y + 6;

      const lines = e.lines || [];
      for (const ln of lines) {
        if (y + lineSmall > bottom) {
          doc.addPage();
          y = doc.page.margins.top;
        }
        const acc = ln.account;
        const code = acc && typeof acc === "object" ? acc.code : "";
        const name = acc && typeof acc === "object" ? acc.name : "";
        doc.font("Helvetica").fontSize(8).fillColor("#334155");
        doc.text(`${code || "—"} ${name || ""}`.trim(), left + 8, y, { width: w - 120 });
        doc.text(fmtMoney(ln.debit), left + w - 110, y, { width: 50, align: "right" });
        doc.text(fmtMoney(ln.credit), left + w - 55, y, { width: 50, align: "right" });
        y += lineSmall;
      }
      y += 12;
    }

    if (entries.length === 0) {
      doc.font("Helvetica").fontSize(10).fillColor("#64748b").text("No journal entries in this range.", left, y);
    }

    const range = doc.bufferedPageRange();
    const startPage = range.start;
    const count = range.count;
    for (let i = 0; i < count; i += 1) {
      doc.switchToPage(startPage + i);
      doc.font("Helvetica").fontSize(8).fillColor("#94a3b8");
      doc.text(
        `Journal export · Page ${i + 1} of ${count}`,
        left,
        doc.page.height - doc.page.margins.bottom + 8,
        { width: w, align: "center" },
      );
    }

    doc.end();
  });
}

/**
 * @param {object} data - result of accountingService.buildCustomerStatement
 */
function customerStatementToPdfBuffer(data, opts = {}) {
  const orgName = opts.orgName || "";
  const generatedAt = new Date();
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({
      margin: 48,
      size: "LETTER",
      bufferPages: true,
      info: {
        Title: "Customer statement",
        Author: "POS Accounting",
        Subject: "Accounts receivable statement",
      },
    });
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = 48;
    const w = doc.page.width - 96;
    let y = doc.page.margins.top;
    doc.font("Helvetica-Bold").fontSize(16).fillColor("#0f172a").text("Customer statement", left, y);
    y = doc.y + 6;
    doc.font("Helvetica").fontSize(9).fillColor("#64748b");
    if (orgName) doc.text(orgName, left, y, { width: w });
    y = doc.y + 4;
    doc.text(`As of: ${fmtDateIso(data.asOf)} · Currency: ${data.currency || "USD"}`, left, y, { width: w });
    y = doc.y + 14;

    const c = data.customer || {};
    doc.font("Helvetica-Bold").fontSize(11).text(c.name || "Customer", left, y);
    y = doc.y + 4;
    doc.font("Helvetica").fontSize(9).fillColor("#334155");
    doc.text(`AR balance: ${fmtMoney(c.arBalance)} · Unapplied credit: ${fmtMoney(c.unappliedCredit)}`, left, y, {
      width: w,
    });
    y = doc.y + 12;

    doc.font("Helvetica-Bold").fontSize(10).text("Open invoices", left, y);
    y = doc.y + 6;
    const open = data.openInvoices || [];
    if (open.length === 0) {
      doc.font("Helvetica").fontSize(9).fillColor("#64748b").text("No open invoices.", left, y);
    } else {
      for (const row of open) {
        doc
          .font("Helvetica")
          .fontSize(8)
          .fillColor("#0f172a")
          .text(
            `${row.invoiceNumber} · due ${fmtDateIso(row.dueDate)} · due ${fmtMoney(row.amountDue)}`,
            left,
            y,
            { width: w },
          );
        y = doc.y + 4;
      }
    }
    y = doc.y + 10;
    doc.font("Helvetica-Bold").fontSize(9).text(`Total open: ${fmtMoney(data.totalOpenAmount || 0)}`, left, y);

    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i += 1) {
      doc.switchToPage(range.start + i);
      doc.font("Helvetica").fontSize(8).fillColor("#94a3b8");
      doc.text(
        `Generated (UTC): ${generatedAt.toISOString().replace("T", " ").slice(0, 19)} · Page ${i + 1}/${range.count}`,
        left,
        doc.page.height - doc.page.margins.bottom + 8,
        { width: w, align: "center" },
      );
    }
    doc.end();
  });
}

/**
 * @param {object} data - result of accountingService.buildSupplierStatement
 */
function supplierStatementToPdfBuffer(data, opts = {}) {
  const orgName = opts.orgName || "";
  const generatedAt = new Date();
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({
      margin: 48,
      size: "LETTER",
      bufferPages: true,
      info: {
        Title: "Supplier statement",
        Author: "POS Accounting",
        Subject: "Accounts payable statement",
      },
    });
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = 48;
    const w = doc.page.width - 96;
    let y = doc.page.margins.top;
    doc.font("Helvetica-Bold").fontSize(16).fillColor("#0f172a").text("Supplier statement", left, y);
    y = doc.y + 6;
    doc.font("Helvetica").fontSize(9).fillColor("#64748b");
    if (orgName) doc.text(orgName, left, y, { width: w });
    y = doc.y + 4;
    doc.text(`As of: ${fmtDateIso(data.asOf)} · Currency: ${data.currency || "USD"}`, left, y, { width: w });
    y = doc.y + 14;

    const s = data.supplier || {};
    doc.font("Helvetica-Bold").fontSize(11).text(s.name || "Supplier", left, y);
    y = doc.y + 4;
    doc.font("Helvetica").fontSize(9).fillColor("#334155");
    if (s.code) doc.text(`Code: ${s.code}`, left, y, { width: w });
    y = doc.y + 12;

    doc.font("Helvetica-Bold").fontSize(10).text("Open vendor bills", left, y);
    y = doc.y + 6;
    const open = data.openBills || [];
    if (open.length === 0) {
      doc.font("Helvetica").fontSize(9).fillColor("#64748b").text("No open bills.", left, y);
    } else {
      for (const row of open) {
        doc
          .font("Helvetica")
          .fontSize(8)
          .fillColor("#0f172a")
          .text(
            `${row.vendorBillNumber} · due ${fmtDateIso(row.dueDate)} · due ${fmtMoney(row.amountDue)}`,
            left,
            y,
            { width: w },
          );
        y = doc.y + 4;
      }
    }
    y = doc.y + 10;
    doc.font("Helvetica-Bold").fontSize(9).text(`Total open: ${fmtMoney(data.totalOpenAmount || 0)}`, left, y);

    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i += 1) {
      doc.switchToPage(range.start + i);
      doc.font("Helvetica").fontSize(8).fillColor("#94a3b8");
      doc.text(
        `Generated (UTC): ${generatedAt.toISOString().replace("T", " ").slice(0, 19)} · Page ${i + 1}/${range.count}`,
        left,
        doc.page.height - doc.page.margins.bottom + 8,
        { width: w, align: "center" },
      );
    }
    doc.end();
  });
}

/**
 * @param {{ period: string; locationId: string | null; vatRate: number; totalSales: number; netSales: number; totalVATCollected: number }} data
 * @param {{ orgName?: string }} opts
 * @returns {Promise<Buffer>}
 */
function vatReportToPdfBuffer(data, opts = {}) {
  const orgName = opts.orgName || "";
  const generatedAt = new Date();
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({
      margin: 48,
      size: "LETTER",
      bufferPages: true,
      info: {
        Title: "VAT report",
        Author: "POS Accounting",
        Subject: "Monthly VAT collection report",
      },
    });
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = 48;
    const width = doc.page.width - 96;
    let y = doc.page.margins.top;

    doc.font("Helvetica-Bold").fontSize(18).fillColor("#0f172a").text("VAT Report", left, y);
    y = doc.y + 6;
    doc.font("Helvetica").fontSize(10).fillColor("#475569");
    if (orgName) {
      doc.text(orgName, left, y, { width });
      y = doc.y + 2;
    }
    doc.text(`Period: ${data.period}`, left, y, { width });
    y = doc.y + 2;
    doc.text(`VAT rate: ${fmtMoney(data.vatRate)}%`, left, y, { width });
    y = doc.y + 2;
    doc.text(`Location scope: ${data.locationId || "all"}`, left, y, { width });
    y = doc.y + 14;

    doc.strokeColor("#cbd5e1").lineWidth(0.75).moveTo(left, y).lineTo(left + width, y).stroke();
    y += 14;

    const rows = [
      ["Net sales", fmtMoney(data.netSales)],
      ["VAT collected", fmtMoney(data.totalVATCollected)],
      ["Gross sales", fmtMoney(data.totalSales)],
    ];
    for (const row of rows) {
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#0f172a").text(row[0], left, y, { width: width * 0.5 });
      doc.font("Helvetica").fontSize(11).fillColor("#0f172a").text(row[1], left + width * 0.5, y, {
        width: width * 0.5,
        align: "right",
      });
      y = doc.y + 10;
    }

    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i += 1) {
      doc.switchToPage(range.start + i);
      doc.font("Helvetica").fontSize(8).fillColor("#94a3b8");
      doc.text(
        `Generated (UTC): ${generatedAt.toISOString().replace("T", " ").slice(0, 19)} · Page ${i + 1}/${range.count}`,
        left,
        doc.page.height - doc.page.margins.bottom + 8,
        { width, align: "center" }
      );
    }

    doc.end();
  });
}

module.exports = {
  trialBalanceToPdfBuffer,
  journalsToPdfBuffer,
  customerStatementToPdfBuffer,
  supplierStatementToPdfBuffer,
  vatReportToPdfBuffer,
};
