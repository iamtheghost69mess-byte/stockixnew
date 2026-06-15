import { Injectable, Module, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';
import { MAIL_TRANSPORTER_PROVIDER } from './Mail.constants';
import { MailTransporter } from './MailTransporter.service';

@Injectable()
class MailConfigStartupCheck implements OnModuleInit {
  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const password = this.configService.get<string>('mail.password');
    const fromAddress = this.configService.get<string>('mail.from.address');
    if (!password?.trim() || !fromAddress?.trim()) {
      console.warn(
        '[MailModule] MAIL_PASSWORD or MAIL_FROM_ADDRESS is not set; outbound email will fail',
      );
    }
  }
}

@Module({
  providers: [
    MailConfigStartupCheck,
    {
      provide: MAIL_TRANSPORTER_PROVIDER,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        // Create reusable transporter object using the default SMTP transport
        const transporter = createTransport({
          host: configService.get('mail.host'),
          port: configService.get('mail.port'),
          secure: configService.get('mail.secure'), // true for 465, false for other ports
          auth: {
            user: configService.get('mail.username'),
            pass: configService.get('mail.password'),
          },
          connectionTimeout: 10000,
          greetingTimeout: 10000,
          socketTimeout: 30000,
        });
        return transporter;
      },
    },
    MailTransporter,
  ],
  exports: [MAIL_TRANSPORTER_PROVIDER, MailTransporter],
})
export class MailModule {}
