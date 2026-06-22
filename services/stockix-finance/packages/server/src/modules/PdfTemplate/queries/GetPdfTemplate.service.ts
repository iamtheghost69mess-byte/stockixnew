import { Inject, Injectable } from '@nestjs/common';
import { Knex } from 'knex';
import { GetPdfTemplateTransformer } from './GetPdfTemplate.transformer';
import { PdfTemplateModel } from '../models/PdfTemplate';
import { TransformerInjectable } from '../../Transformer/TransformerInjectable.service';
import { TenantModelProxy } from '@/modules/System/models/TenantBaseModel';
import { GetAttachmentBase64 } from '@/modules/Attachments/GetAttachmentBase64';

@Injectable()
export class GetPdfTemplateService {
  constructor(
    @Inject(PdfTemplateModel.name)
    private readonly pdfTemplateModel: TenantModelProxy<
      typeof PdfTemplateModel
    >,
    private readonly transformer: TransformerInjectable,
    private readonly getAttachmentBase64: GetAttachmentBase64,
  ) {}

  /**
   * Retrieves a pdf template by its ID.
   * @param {number} templateId - The ID of the pdf template to retrieve.
   * @return {Promise<any>} - The retrieved pdf template.
   */
  async getPdfTemplate(
    templateId: number,
    trx?: Knex.Transaction,
  ): Promise<any> {
    const template = await this.pdfTemplateModel()
      .query(trx)
      .findById(templateId)
      .throwIfNotFound();

    const companyLogoKey = template.attributes?.companyLogoKey;
    let companyLogoUri: string | null = null;

    if (companyLogoKey) {
      try {
        companyLogoUri =
          await this.getAttachmentBase64.getBase64(companyLogoKey);
      } catch {
        companyLogoUri = null;
      }
    }
    return this.transformer.transform(
      { ...template, companyLogoUri },
      new GetPdfTemplateTransformer(),
    );
  }
}
