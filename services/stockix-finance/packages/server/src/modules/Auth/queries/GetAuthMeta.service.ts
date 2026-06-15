import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IAuthGetMetaPOJO } from '../Auth.interfaces';

@Injectable()
export class GetAuthMetaService {

  constructor(
    private readonly configService: ConfigService,
  ) {

  }
  /**
   * Retrieves authentication meta for unauthenticated SPA routes (login/register).
   *
   * License fields are intentionally null here: there is no tenant context before
   * sign-in. After login, license state is provided by dashboard boot meta
   * (`DashboardService.getBootMeta` → `useDashboardMeta`).
   *
   * @returns {Promise<IAuthGetMetaPOJO>}
   */
  public async getAuthMeta(): Promise<IAuthGetMetaPOJO> {
    return {
      signupDisabled: this.configService.get('signupRestrictions.disabled'),
      licenseStatus: null,
      licenseExpiresAt: null,
      licenseGracePeriodEndsAt: null,
      billingEnabled: process.env.BILLING_ENABLED === 'true',
    };
  }
}
