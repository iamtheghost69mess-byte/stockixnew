import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import * as os from 'os';
import * as path from 'path';
import { promises as fs } from 'fs';
import { PageProperties, PdfFormat } from '@/libs/chromiumly/_types';
import { HtmlConverter } from '@/libs/chromiumly/HTMLConvert';

@Injectable()
export class ChromiumlyHtmlConvert {
  /**
   * Converts the given HTML content to PDF via Gotenberg HTML endpoint.
   * Writes a temp file to /tmp, sends it to Gotenberg as multipart.
   * Throws ServiceUnavailableException (503) when the PDF service is not reachable.
   */
  async convert(
    html: string,
    properties?: PageProperties,
    pdfFormat?: PdfFormat,
  ): Promise<Buffer> {
    const filename = `document-print-${Date.now()}.html`;
    const filePath = path.join(os.tmpdir(), filename);

    await fs.writeFile(filePath, html, 'utf8');
    try {
      const converter = new HtmlConverter();
      return await converter.convert({ html: filePath, properties, pdfFormat });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes('GOTENBERG_URL') ||
        message.includes('ECONNREFUSED') ||
        message.includes('ENOTFOUND') ||
        message.includes('PDF service')
      ) {
        throw new ServiceUnavailableException(
          'PDF generation service is unavailable. Ensure GOTENBERG_URL is set and Gotenberg is running.',
        );
      }
      throw error;
    } finally {
      await fs.unlink(filePath).catch(() => {});
    }
  }
}
