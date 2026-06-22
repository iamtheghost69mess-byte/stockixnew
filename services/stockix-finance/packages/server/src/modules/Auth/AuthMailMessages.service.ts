import { Injectable } from '@nestjs/common';
import * as path from 'path';
import { SystemUser } from '../System/models/SystemUser';
import { ModelObject } from 'objection';
import { ConfigService } from '@nestjs/config';
import { Mail } from '../Mail/Mail';
import { formatMailFrom } from '../Mail/Mail.utils';
import { MailTransporter } from '../Mail/MailTransporter.service';

@Injectable()
export class AuthenticationMailMesssages {
  constructor(
    private readonly configService: ConfigService,
    private readonly mailTransporter: MailTransporter,
  ) {}

  /**
   * Sends reset password message.
   * @param {ISystemUser} user - The system user.
   * @param {string} token - Reset password token.
   * @returns {Mail}
   */
  resetPasswordMessage(user: ModelObject<SystemUser>, token: string) {
    const baseURL = this.configService.get('app.baseUrl');

    return new Mail()
      .setSubject('Stockix - Password Reset')
      .setFrom(formatMailFrom())
      .setView('mail/ResetPassword.html')
      .setTo(user.email)
      .setAttachments([
        {
          filename: 'bigcapital.png',
          path: path.join(global.__static_dirname, `/images/bigcapital.png`),
          cid: 'bigcapital_logo',
        },
      ])
      .setData({
        resetPasswordUrl: `${baseURL}/auth/reset_password/${token}`,
        first_name: user.firstName,
        last_name: user.lastName,
      });
  }

  sendResetPasswordMail(user: ModelObject<SystemUser>, token: string) {
    const mail = this.resetPasswordMessage(user, token);
    mail.setIdempotencyKey(
      `reset-password/${user.email}/${token.substring(0, 8)}`,
    );

    return this.mailTransporter.send(mail);
  }

  /**
   * Sends signup verification mail.
   * @param {string} email - Email address
   * @param {string} fullName - User name.
   * @param {string} token - Verification token.
   * @returns {Mail}
   */
  signupVerificationMail(email: string, fullName: string, token: string) {
    const baseURL = this.configService.get('app.baseUrl');
    const verifyUrl = `${baseURL}/auth/email_confirmation?token=${token}&email=${email}`;

    return new Mail()
      .setSubject('Stockix - Verify your email')
      .setFrom(formatMailFrom())
      .setView('mail/SignupVerifyEmail.html')
      .setTo(email)
      .setAttachments([
        {
          filename: 'bigcapital.png',
          path: path.join(global.__static_dirname, `/images/bigcapital.png`),
          cid: 'bigcapital_logo',
        },
      ])
      .setData({ verifyUrl, fullName });
  }

  sendSignupVerificationMail(email: string, fullName: string, token: string) {
    const mail = this.signupVerificationMail(email, fullName, token);
    mail.setIdempotencyKey(
      `signup-verify/${email}/${token.substring(0, 8)}`,
    );
    return this.mailTransporter.send(mail);
  }
}
