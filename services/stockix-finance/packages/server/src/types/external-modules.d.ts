declare module '@stockix/pdf-templates' {
  export function renderBillPaperTemplateHtml(
    template: unknown,
    data?: unknown,
  ): string;
  export function renderInvoicePaperTemplateHtml(
    template: unknown,
    data?: unknown,
  ): string;
  export function renderCreditNotePaperTemplateHtml(
    template: unknown,
    data?: unknown,
  ): string;
  export function renderEstimatePaperTemplateHtml(
    template: unknown,
    data?: unknown,
  ): string;
  export function renderReceiptPaperTemplateHtml(
    template: unknown,
    data?: unknown,
  ): string;
  export function renderPaymentReceivedPaperTemplateHtml(
    template: unknown,
    data?: unknown,
  ): string;
  export function renderExportResourceTableTemplateHtml(
    template: unknown,
    data?: unknown,
  ): Promise<string>;
}
