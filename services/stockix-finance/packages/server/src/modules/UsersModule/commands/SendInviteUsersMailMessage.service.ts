import * as path from 'path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModelObject } from 'objection';
import { Mail } from '@/modules/Mail/Mail';
import { formatMailFrom } from '@/modules/Mail/Mail.utils';
import { MailTransporter } from '@/modules/Mail/MailTransporter.service';
import { SystemUser } from '@/modules/System/models/SystemUser';
import { TenancyContext } from '@/modules/Tenancy/TenancyContext.service';
import { UserInvite } from '../models/InviteUser.model';
import { TenantUser } from '@/modules/Tenancy/TenancyModels/models/TenantUser.model';

@Injectable()
export class SendInviteUsersMailMessage {
  constructor(
    private readonly mailTransporter: MailTransporter,
    private readonly tenancyContext: TenancyContext,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Sends invite mail to the given email.
   * @param {ModelObject<TenantUser>} user
   * @param {ModelObject<UserInvite>} invite
   */
  async sendInviteMail(
    fromUser: ModelObject<TenantUser>,
    invite: ModelObject<UserInvite>,
  ) {
    const tenant = await this.tenancyContext.getTenant(true);
    const root = path.join(global.__images_dirname, '/bigcapital.png');
    const baseURL = this.configService.get('app.baseUrl');

    const firstName = fromUser?.firstName ?? 'Your administrator';
    const lastName = fromUser?.lastName ?? '';
    const senderEmail = fromUser?.email ?? '';

    const mail = new Mail()
      .setSubject(`${firstName} has invited you to join Stockix`)
      .setFrom(formatMailFrom())
      .setView('mail/UserInvite.html')
      .setTo(invite.email)
      .setAttachments([
        {
          filename: 'bigcapital.png',
          path: root,
          cid: 'bigcapital_logo',
        },
      ])
      .setData({
        root,
        acceptUrl: `${baseURL}/auth/invite/${invite.token}/accept`,
        fullName: `${firstName} ${lastName}`.trim(),
        firstName,
        lastName,
        email: senderEmail,
        organizationName: tenant.metadata.name,
      });
    mail.setIdempotencyKey(`invite/${invite.email}/${invite.token.substring(0, 8)}`);
    await this.mailTransporter.send(mail);
  }
}
