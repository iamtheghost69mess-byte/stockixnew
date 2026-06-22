import { ClsService } from 'nestjs-cls';
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { SystemUser } from '@/modules/System/models/SystemUser';
import UserTenant from '@/modules/System/models/UserTenant';
import { TenantModel } from '@/modules/System/models/TenantModel';
import { ModelObject } from 'objection';
import { JwtPayload } from '../Auth.interfaces';
import { InvalidEmailPasswordException } from '../exceptions/InvalidEmailPassword.exception';
import { UserNotFoundException } from '../exceptions/UserNotFound.exception';

@Injectable()
export class AuthSigninService {
  constructor(
    @Inject(SystemUser.name)
    private readonly systemUserModel: typeof SystemUser,
    @Inject(UserTenant.name)
    private readonly userTenantModel: typeof UserTenant,
    @Inject(TenantModel.name)
    private readonly tenantModel: typeof TenantModel,
    private readonly jwtService: JwtService,
    private readonly clsService: ClsService,
  ) {}

  /**
   * Validates the given email and password.
   * @param {string} email - Signin email address.
   * @param {string} password - Signin password.
   * @returns {Promise<ModelObject<SystemUser>>}
   */
  async signin(
    email: string,
    password: string,
  ): Promise<ModelObject<SystemUser>> {
    let user: SystemUser;

    try {
      user = await this.systemUserModel
        .query()
        .findOne({ email })
        .throwIfNotFound();
    } catch (err) {
      throw new InvalidEmailPasswordException(email);
    }
    if (!(await user.checkPassword(password))) {
      throw new InvalidEmailPasswordException(email);
    }
    return user as any;
  }

  /**
   * Verifies the given jwt payload.
   * @param {JwtPayload} payload
   * @returns {Promise<any>}
   */
  async verifyPayload(payload: JwtPayload): Promise<any> {
    let user: SystemUser;

    try {
      user = await this.systemUserModel
        .query()
        .findOne({ email: payload.sub })
        .throwIfNotFound();

      await this.userTenantModel
        .query()
        .findOne({ userId: user.id, organizationId: payload.organizationId })
        .throwIfNotFound();

      const tenant = await this.tenantModel
        .query()
        .findOne({ organizationId: payload.organizationId })
        .throwIfNotFound();

      this.clsService.set('userId', user.id);
      this.clsService.set('organizationId', payload.organizationId);
      this.clsService.set('tenantId', tenant.id);
    } catch (error) {
      throw new UserNotFoundException(String(payload.sub));
    }
    return payload;
  }

  /**
   * Signs a JWT for the given user and organization.
   * Includes a `jti` (JWT ID) so the token can be individually revoked on logout.
   */
  async signToken(user: SystemUser, organizationId: string): Promise<string> {
    return this.jwtService.sign({ sub: user.email, organizationId, jti: randomUUID() });
  }
}
