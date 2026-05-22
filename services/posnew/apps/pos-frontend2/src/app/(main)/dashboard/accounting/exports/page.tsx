"use client";

import { useState } from "react";

import Link from "next/link";

import { format, subDays } from "date-fns";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import {
  posDownloadGlIntegrationJson,
  posDownloadJournalCsv,
  posDownloadJournalPdf,
  posDownloadTrialBalancePdf,
  triggerBrowserDownload,
} from "@/lib/pos-accounting-api";
import { posCan } from "@/lib/pos-permissions";
import { usePosAuthStore } from "@/stores/pos-auth-store";

export default function AccountingExportsPage() {
  const permissions = usePosAuthStore((s) => s.user?.permissions ?? []);
  const canGlRead = posCan(permissions, "backoffice.accounting.gl.read");

  const defaultEnd = format(new Date(), "yyyy-MM-dd");
  const defaultStart = format(subDays(new Date(), 90), "yyyy-MM-dd");
  const [csvStart, setCsvStart] = useState(defaultStart);
  const [csvEnd, setCsvEnd] = useState(defaultEnd);
  const [jsonStart, setJsonStart] = useState(defaultStart);
  const [jsonEnd, setJsonEnd] = useState(defaultEnd);
  const [tbStart, setTbStart] = useState(defaultStart);
  const [tbEnd, setTbEnd] = useState(defaultEnd);
  const [csvBusy, setCsvBusy] = useState(false);
  const [journalPdfBusy, setJournalPdfBusy] = useState(false);
  const [tbPdfBusy, setTbPdfBusy] = useState(false);
  const [jsonBusy, setJsonBusy] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastFailedAction, setLastFailedAction] = useState<null | "csv" | "journal-pdf" | "tb-pdf" | "json">(null);

  function clearLastError() {
    setLastError(null);
    setLastFailedAction(null);
  }

  async function onDownloadCsv() {
    clearLastError();
    setCsvBusy(true);
    try {
      const { blob, filename } = await posDownloadJournalCsv({
        start: csvStart.trim() || undefined,
        end: csvEnd.trim() || undefined,
      });
      triggerBrowserDownload(blob, filename);
      toast.success("Download started.");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Download failed.";
      toast.error(message);
      setLastError(message);
      setLastFailedAction("csv");
    } finally {
      setCsvBusy(false);
    }
  }

  async function onDownloadJournalPdf() {
    clearLastError();
    setJournalPdfBusy(true);
    try {
      const { blob, filename } = await posDownloadJournalPdf({
        start: csvStart.trim() || undefined,
        end: csvEnd.trim() || undefined,
      });
      triggerBrowserDownload(blob, filename);
      toast.success("PDF download started.");
    } catch (e) {
      const message = e instanceof Error ? e.message : "PDF download failed.";
      toast.error(message);
      setLastError(message);
      setLastFailedAction("journal-pdf");
    } finally {
      setJournalPdfBusy(false);
    }
  }

  async function onDownloadTrialBalancePdf() {
    clearLastError();
    setTbPdfBusy(true);
    try {
      const { blob, filename } = await posDownloadTrialBalancePdf({
        start: tbStart.trim() || undefined,
        end: tbEnd.trim() || undefined,
      });
      triggerBrowserDownload(blob, filename);
      toast.success("Trial balance PDF started.");
    } catch (e) {
      const message = e instanceof Error ? e.message : "PDF download failed.";
      toast.error(message);
      setLastError(message);
      setLastFailedAction("tb-pdf");
    } finally {
      setTbPdfBusy(false);
    }
  }

  async function onDownloadJson() {
    clearLastError();
    setJsonBusy(true);
    try {
      await posDownloadGlIntegrationJson({
        start: jsonStart.trim() || undefined,
        end: jsonEnd.trim() || undefined,
      });
      toast.success("Download started.");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Download failed.";
      toast.error(message);
      setLastError(message);
      setLastFailedAction("json");
    } finally {
      setJsonBusy(false);
    }
  }

  async function retryLastFailedAction() {
    if (lastFailedAction === "csv") return onDownloadCsv();
    if (lastFailedAction === "journal-pdf") return onDownloadJournalPdf();
    if (lastFailedAction === "tb-pdf") return onDownloadTrialBalancePdf();
    if (lastFailedAction === "json") return onDownloadJson();
  }

  if (!canGlRead) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">
          GL exports require <span className="font-mono text-xs">backoffice.accounting.gl.read</span>.
        </p>
        <Button variant="link" asChild className="mt-2 h-auto px-0">
          <Link href="/dashboard/accounting">Back</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <Button variant="ghost" size="sm" className="mb-2 -ml-2" asChild>
          <Link href="/dashboard/accounting/accounts">
            <ArrowLeft className="mr-2 size-4" />
            Accounts
          </Link>
        </Button>
        <h1 className="flex items-center gap-2 font-semibold text-2xl tracking-tight">
          <Download className="size-7" />
          GL data exports
        </h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Journal CSV/JSON/PDF and trial balance PDF. PDFs include document metadata (title, author, subject) and
          formatted layouts via PDFKit on the server.
        </p>
      </div>

      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
        <p className="font-medium text-amber-950 dark:text-amber-100">Sensitive data</p>
        <p className="mt-1 text-muted-foreground">
          Integration JSON includes full journal payloads. Store and share according to your security policy.
        </p>
      </div>
      {lastError ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
          <p className="text-destructive">Last export failed: {lastError}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void retryLastFailedAction()}
            disabled={!lastFailedAction || csvBusy || journalPdfBusy || tbPdfBusy || jsonBusy}
          >
            Retry
          </Button>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Journals (CSV &amp; PDF)</CardTitle>
          <CardDescription>
            <code className="text-xs">/export/journals.csv</code> ·{" "}
            <code className="text-xs">/export/journals.pdf</code> — PDF lists up to <strong>500</strong> entries per
            request.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="csv-start">Start date</Label>
              <DatePicker id="csv-start" value={csvStart} onValueChange={setCsvStart} className="w-full" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="csv-end">End date</Label>
              <DatePicker id="csv-end" value={csvEnd} onValueChange={setCsvEnd} className="w-full" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void onDownloadCsv()} disabled={csvBusy}>
              {csvBusy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Download className="mr-2 size-4" />}
              Download CSV
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void onDownloadJournalPdf()}
              disabled={journalPdfBusy}
            >
              {journalPdfBusy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Download className="mr-2 size-4" />}
              Download PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Trial balance PDF</CardTitle>
          <CardDescription>
            
            <Link
              href="/dashboard/accounting/trial-balance"
              className="text-primary underline-offset-4 hover:underline"
            >
              trial balance
            </Link>{" "}
            page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="tb-start">Start date</Label>
              <DatePicker id="tb-start" value={tbStart} onValueChange={setTbStart} className="w-full" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tb-end">End date</Label>
              <DatePicker id="tb-end" value={tbEnd} onValueChange={setTbEnd} className="w-full" />
            </div>
          </div>
          <Button type="button" onClick={() => void onDownloadTrialBalancePdf()} disabled={tbPdfBusy}>
            {tbPdfBusy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Download className="mr-2 size-4" />}
            Download trial balance PDF
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Integration JSON</CardTitle>
          
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="json-start">Start date</Label>
              <DatePicker id="json-start" value={jsonStart} onValueChange={setJsonStart} className="w-full" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="json-end">End date</Label>
              <DatePicker id="json-end" value={jsonEnd} onValueChange={setJsonEnd} className="w-full" />
            </div>
          </div>
          <Button type="button" variant="secondary" onClick={() => void onDownloadJson()} disabled={jsonBusy}>
            {jsonBusy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Download className="mr-2 size-4" />}
            Download JSON
          </Button>
        </CardContent>
      </Card>

      <p className="text-muted-foreground text-sm">
        <Link href="/dashboard/accounting/audit-log" className="text-primary underline-offset-4 hover:underline">
          Audit log
        </Link>{" "}
        (accounting read) lists posting events separately.
      </p>
    </div>
  );
}
