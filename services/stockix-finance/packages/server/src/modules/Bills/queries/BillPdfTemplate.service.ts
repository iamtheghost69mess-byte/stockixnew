import { Injectable } from '@nestjs/common';
import { defaultBillBrandingAttributes } from '../Bills.constants';
import { GetPdfTemplateService } from '../../PdfTemplate/queries/GetPdfTemplate.service';
import { GetOrganizationBrandingAttributesService } from '../../PdfTemplate/queries/GetOrganizationBrandingAttributes.service';
import { mergePdfTemplateWithDefaultAttributes } from '../../SaleInvoices/utils';

@Injectable()
export class BillPdfTemplate {
  constructor(
    private getPdfTemplateService: GetPdfTemplateService,
    private getOrgBrandingAttributes: GetOrganizationBrandingAttributesService,
  ) {}

  /**
   * Retrieves the bill branding template.
   * @param {number} templateId
   * @returns {}
   */
  public async getBillBrandingTemplate(templateId: number) {
    const template =
      await this.getPdfTemplateService.getPdfTemplate(templateId);

    const commonOrgBrandingAttrs =
      await this.getOrgBrandingAttributes.execute();

    const organizationBrandingAttrs = {
      ...defaultBillBrandingAttributes,
      ...commonOrgBrandingAttrs,
    };
    const brandingTemplateAttrs = {
      ...template.attributes,
      companyLogoUri: template.companyLogoUri,
    };
    const attributes = mergePdfTemplateWithDefaultAttributes(
      brandingTemplateAttrs,
      organizationBrandingAttrs,
    );
    return {
      ...template,
      attributes,
    };
  }
}
