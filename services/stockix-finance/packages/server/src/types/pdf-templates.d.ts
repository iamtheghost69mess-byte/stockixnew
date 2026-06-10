declare module '@stockix/pdf-templates' {
  export function renderBillPaperTemplateHtml(...args: any[]): Promise<string>;
  export function renderInvoicePaperTemplateHtml(...args: any[]): Promise<string>;
  export function renderCreditNotePaperTemplateHtml(...args: any[]): Promise<string>;
  export function renderEstimatePaperTemplateHtml(...args: any[]): Promise<string>;
  export function renderReceiptPaperTemplateHtml(...args: any[]): Promise<string>;
  export function renderPaymentReceivedPaperTemplateHtml(...args: any[]): Promise<string>;
  export function renderExportResourceTableTemplateHtml(...args: any[]): Promise<string>;
}
