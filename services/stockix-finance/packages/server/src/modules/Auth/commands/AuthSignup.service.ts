import * as crypto from 'crypto';
import * as moment from 'moment';
import { events } from '@/common/events/events';
import { ServiceError } from '@/modules/Items/ServiceError';
import { SystemUser } from '@/modules/System/models/SystemUser';
import UserTenant from '@/modules/System/models/UserTenant';
import { TenantsManagerService } from '@/modules/TenantDBManager/TenantsManager';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuthSignupDto } from '../dtos/AuthSignup.dto';
import {
  IAuthSignedUpEventPayload,
  IAuthSigningUpEventPayload,
} from '../Auth.interfaces';
import { ERRORS } from '../Auth.constants';
import { hashPassword } from '../Auth.utils';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class AuthSignupService {
  /**
   * @param {ConfigService} configService - Config service
   * @param {EventEmitter2} eventEmitter - Event emitter
   * @param {TenantsManagerService} tenantsManager - Tenants manager
   * @param {typeof SystemUser} systemUserModel - System user model
   */
  constructor(
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    private readonly tenantsManager: TenantsManagerService,
    private readonly clsService: ClsService,

    @Inject(SystemUser.name)
    private readonly systemUserModel: typeof SystemUser,

    @Inject(UserTenant.name)
    private readonly userTenantModel: typeof UserTenant,
  ) {}

  /**
   * Registers a new tenant with user from user input.
   * @param {AuthSignupDto} signupDTO
   */
  public async signUp(signupDTO: AuthSignupDto) {
    // Validates the signup disable restrictions.
    await this.validateSignupRestrictions(signupDTO.email);

    const hashedPassword = await hashPassword(signupDTO.password);
    const signupConfirmation = this.configService.get('signupConfirmation');

    const verifyTokenCrypto = crypto.randomBytes(64).toString('hex');
    const verifiedEnabed = signupConfirmation.enabled ?? false;
    const verifyToken = verifiedEnabed ? verifyTokenCrypto : '';
    const verified = !verifiedEnabed;
    
    const inviteAcceptedAt = moment().format('YYYY-MM-DD');

    // Triggers signin up event.
    await this.eventEmitter.emitAsync(events.auth.signingUp, {
      signupDTO,
    } as IAuthSigningUpEventPayload);

    const tenant = await this.tenantsManager.createTenant();
    await this.validateEmailUniqiness(signupDTO.email, tenant.organizationId);

    const existingUser = await this.systemUserModel
      .query()
      .findOne({ email: signupDTO.email });

    let user: SystemUser;
    if (existingUser) {
      user = existingUser;
    } else {
      user = await this.systemUserModel.query().insert({
        ...signupDTO,
        verifyToken,
        verified,
        active: true,
        password: hashedPassword,
        tenantId: tenant.id,
        inviteAcceptedAt,
      });
    }

    const existingMembership = await this.userTenantModel
      .query()
      .findOne({ userId: user.id, tenantId: tenant.id });

    if (!existingMembership) {
      await this.userTenantModel.query().insert({
        userId: user.id,
        tenantId: tenant.id,
        organizationId: tenant.organizationId,
        role: 'owner',
      });
    }

    if (!user.tenantId) {
      await this.systemUserModel
        .query()
        .findById(user.id)
        .patch({ tenantId: tenant.id });
    }

    // Set the user in the cls service.
    this.clsService.set('tenantId', tenant.id);
    this.clsService.set('userId', user.id);
    this.clsService.set('organizationId', tenant.organizationId);

    // Triggers signed up event.
    await this.eventEmitter.emitAsync(events.auth.signUp, {
      signupDTO,
      tenant,
      user,
    } as IAuthSignedUpEventPayload);

    return {
      userId: user.id,
      tenantId: tenant.id,
      organizationId: tenant.organizationId,
    };
  }

  /**
   * Validates email uniqiness on the storage.
   * @param {string} email - Email address
   */
  private async validateEmailUniqiness(email: string, organizationId: string) {
    const existingUser = await this.systemUserModel.query().findOne({ email });

    if (!existingUser) {
      return;
    }

    const existingMembership = await this.userTenantModel
      .query()
      .findOne({ userId: existingUser.id, organizationId });

    if (existingMembership) {
      throw new ServiceError(
        ERRORS.EMAIL_EXISTS,
        'The given email address is already signed-up',
      );
    }
  }

  /**
   * Validate sign-up disable restrictions.
   * @param {string} email - Signup email address
   */
  private async validateSignupRestrictions(_email: string) {
    const signupRestrictions = this.configService.get('signupRestrictions');

    if (!signupRestrictions.disabled) return;

    throw new ServiceError(
      ERRORS.SIGNUP_RESTRICTED,
      'The sign-up is disabled',
      undefined,
      HttpStatus.FORBIDDEN,
    );
  }
}
