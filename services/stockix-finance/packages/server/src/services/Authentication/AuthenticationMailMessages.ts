import { Service } from 'typedi';
import { ISystemUser } from '@/interfaces';
import config from '@/config';
import Mail from '@/lib/Mail';

// BRAND: Replace `views/images/brand-email.png` with your logo; keep cid in sync with mail/*.html <img src="cid:...">.
@Service()
export default class AuthenticationMailMesssages {
  /**
   * Sends reset password message.
   * @param {ISystemUser} user - The system user.
   * @param {string} token - Reset password token.
   * @return {Promise<void>}
   */
  public async sendResetPasswordMessage(
    user: ISystemUser,
    token: string
  ): Promise<void> {
    await new Mail()
      .setSubject('Password reset')
      .setView('mail/ResetPassword.html')
      .setTo(user.email)
      .setAttachments([
        {
          filename: 'brand-email.png',
          path: `${global.__views_dir}/images/brand-email.png`,
          cid: 'brand_email_logo',
        },
      ])
      .setData({
        resetPasswordUrl: `${config.baseURL}/auth/reset_password/${token}`,
        first_name: user.firstName,
        last_name: user.lastName,
      })
      .send();
  }
}
