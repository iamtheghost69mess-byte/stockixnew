import { Transporter } from 'nodemailer';
import { Mail } from './Mail';
import { Inject, Injectable } from '@nestjs/common';
import { MAIL_TRANSPORTER_PROVIDER } from './Mail.constants';

@Injectable()
export class MailTransporter {
  constructor(
    @Inject(MAIL_TRANSPORTER_PROVIDER)
    private readonly transporter: Transporter,
  ) {}

  async send(mail: Mail) {
    try {
      return await this.transporter.sendMail(mail.mailOptions);
    } catch (error) {
      console.error('[MailTransporter] send failed:', {
        subject: mail.subject,
        to: mail.to,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
