import { ClsService } from 'nestjs-cls';
import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SystemUser } from '@/modules/System/models/SystemUser';
import UserTenant from '@/modules/System/models/UserTenant';
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
    return user;
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

      this.clsService.set('tenantId', user.tenantId);
      this.clsService.set('userId', user.id);

      await this.userTenantModel
        .query()
        .findOne({ userId: user.id, organizationId: payload.organizationId })
        .throwIfNotFound();

      this.clsService.set('organizationId', payload.organizationId);
    } catch (error) {
      throw new UserNotFoundException(String(payload.sub));
    }
    return payload;
  }

  /**
   * Signs a JWT for the given user and organization.
   */
  async signToken(user: SystemUser, organizationId: string): Promise<string> {
    return this.jwtService.sign({ sub: user.email, organizationId });
  }
}
