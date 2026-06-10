export enum PdfFormat {
  A4 = 'A4',
}

export interface PageProperties {
  [key: string]: unknown;
}

export class Chromiumly {
  static gotenbergUrl = '';
  static GOTENBERG_DOCS_ENDPOINT = '/forms/chromium/convert/url';
}

export class UrlConverter {
  convert(_options: {
    url: string;
    properties?: PageProperties;
    pdfFormat?: PdfFormat;
  }): Promise<Buffer> {
    return Promise.resolve(Buffer.from(''));
  }
}
