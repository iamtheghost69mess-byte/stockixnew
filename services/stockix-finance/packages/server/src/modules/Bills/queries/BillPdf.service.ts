import { Inject, Injectable } from '@nestjs/common';
import { renderBillPaperTemplateHtml } from '@stockix/pdf-templates';
import { GetBill } from './GetBill';
import { BillPdfTemplate } from './BillPdfTemplate.service';
import { transformBillToPdfTemplate } from '../utils';
import { Bill } from '../models/Bill';
import { ChromiumlyTenancy } from '@/modules/ChromiumlyTenancy/ChromiumlyTenancy.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PdfTemplateModel } from '@/modules/PdfTemplate/models/PdfTemplate';
import { BillPdfTemplateAttributes } from '../Bills.types';
import { events } from '@/common/events/events';
import { TenantModelProxy } from '@/modules/System/models/TenantBaseModel';
import { PdfDisplayTotalsService } from '@/modules/Pdf/PdfDisplayTotals.service';

@Injectable()
export class BillPdf {
  constructor(
    private readonly chromiumlyTenancy: ChromiumlyTenancy,
    private readonly getBillService: GetBill,
    private readonly billPdfTemplate: BillPdfTemplate,
    private readonly eventPublisher: EventEmitter2,
    private readonly pdfDisplayTotalsService: PdfDisplayTotalsService,

    @Inject(Bill.name)
    private readonly billModel: TenantModelProxy<typeof Bill>,

    @Inject(PdfTemplateModel.name)
    private readonly pdfTemplateModel: TenantModelProxy<
      typeof PdfTemplateModel
    >,
  ) {}

  /**
   * Retrieves bill html content.
   * @param {number} billId - Bill id.
   * @returns {Promise<string>}
   */
  public async getBillHtml(billId: number): Promise<string> {
    const brandingAttributes = await this.getBillBrandingAttributes(billId);

    const props = {
      ...brandingAttributes,
      companyLogoUri:
        (brandingAttributes as any).companyLogoUri ||
        (brandingAttributes as any).companyLogo ||
        '',
    };

    return renderBillPaperTemplateHtml(props);
  }

  /**
   * Retrieves bill pdf content.
   * @param {number} billId - Bill id.
   * @returns {Promise<[Buffer, string]>}
   */
  public async getBillPdf(billId: number): Promise<[Buffer, string]> {
    const filename = await this.getBillFilename(billId);
    const htmlContent = await this.getBillHtml(billId);

    const document =
      await this.chromiumlyTenancy.convertHtmlContent(htmlContent);
    const eventPayload = { billId };

    await this.eventPublisher.emitAsync(events.bill.onPdfViewed, eventPayload);
    return [document, filename];
  }

  /**
   * Retrieves the filename pdf document of the given bill.
   * @param {number} billId
   * @returns {Promise<string>}
   */
  public async getBillFilename(billId: number): Promise<string> {
    const bill = await this.billModel().query().findById(billId);
    return `Bill-${bill.billNumber}`;
  }

  /**
   * Retrieves bill branding attributes.
   * @param {number} billId - The ID of the bill.
   * @returns {Promise<BillPdfTemplateAttributes>} The bill branding attributes.
   */
  public async getBillBrandingAttributes(
    billId: number,
  ): Promise<BillPdfTemplateAttributes> {
    const bill = await this.getBillService.getBill(billId);
    const billModel = await this.billModel().query().findById(billId);

    const displayTotals = billModel
      ? await this.pdfDisplayTotalsService.buildForDocument({
          docCurrency: billModel.currencyCode,
          docDate: billModel.billDate,
          totalInBase: billModel.localAmount,
          dueInBase: billModel.localDueAmount,
        })
      : [];

    const templateId =
      (bill as any).pdfTemplateId ??
      (
        await this.pdfTemplateModel().query().findOne({
          resource: 'Bill',
          default: true,
        })
      )?.id;

    const brandingTemplate =
      await this.billPdfTemplate.getBillBrandingTemplate(templateId);

    return {
      ...brandingTemplate.attributes,
      ...transformBillToPdfTemplate(bill),
      displayTotals,
    };
  }
}
