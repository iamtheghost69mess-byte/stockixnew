import { Inject, Injectable, Logger, Module, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';
import { MAIL_TRANSPORTER_PROVIDER } from './Mail.constants';
import { MailTransporter } from './MailTransporter.service';

@Injectable()
class MailConfigStartupCheck implements OnModuleInit {
  private readonly logger = new Logger('MailModule');

  constructor(
    private readonly configService: ConfigService,
    @Inject(MAIL_TRANSPORTER_PROVIDER)
    private readonly transporter: Transporter,
  ) {}

  async onModuleInit() {
    const host = this.configService.get<string>('mail.host');
    const password = this.configService.get<string>('mail.password');
    const fromAddress = this.configService.get<string>('mail.from.address');

    if (!host?.trim() || !password?.trim() || !fromAddress?.trim()) {
      this.logger.warn(
        'MAIL_HOST, MAIL_PASSWORD, or MAIL_FROM_ADDRESS is not configured — outbound email is disabled. ' +
          'Set these environment variables to enable user invitations and transaction notifications.',
      );
      return;
    }
    try {
      await this.transporter.verify();
      this.logger.log(`SMTP connection verified (${host})`);
    } catch (error) {
      this.logger.error(
        `SMTP connection failed for host "${host}": ${error instanceof Error ? error.message : error}. ` +
          'Check MAIL_HOST, MAIL_PORT, MAIL_USERNAME, and MAIL_PASSWORD.',
      );
    }
  }
}

@Module({
  providers: [
    {
      provide: MAIL_TRANSPORTER_PROVIDER,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        return createTransport({
          host: configService.get('mail.host'),
          port: configService.get('mail.port'),
          secure: configService.get('mail.secure'),
          auth: {
            user: configService.get('mail.username'),
            pass: configService.get('mail.password'),
          },
          connectionTimeout: 10000,
          greetingTimeout: 10000,
          socketTimeout: 30000,
        });
      },
    },
    MailTransporter,
    MailConfigStartupCheck,
  ],
  exports: [MAIL_TRANSPORTER_PROVIDER, MailTransporter],
})
export class MailModule {}
