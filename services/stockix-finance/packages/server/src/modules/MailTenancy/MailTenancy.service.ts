import { Injectable } from '@nestjs/common';
import { TenancyContext } from '../Tenancy/TenancyContext.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MailTenancy {
  constructor(
    private readonly tenancyContext: TenancyContext,
    private readonly config: ConfigService
  ) {}

  /**
   * Retrieves the senders mails of the given tenant.
   */
  public async senders() {
    const tenantMetadata = await this.tenancyContext.getTenantMetadata();
    const globalFrom = this.config.get('mail.from');

    const fromAddress = tenantMetadata.fromEmailAddress
      ? {
          name: tenantMetadata.fromEmailName ?? tenantMetadata.name,
          address: tenantMetadata.fromEmailAddress,
        }
      : globalFrom;

    return [
      {
        mail: fromAddress,
        label: tenantMetadata.fromEmailName ?? tenantMetadata.name,
        primary: true,
      },
    ].filter((item) => item.mail);
  }
}