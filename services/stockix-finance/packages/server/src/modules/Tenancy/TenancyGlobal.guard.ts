import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  SetMetadata,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClsService } from 'nestjs-cls';
import { IS_PUBLIC_ROUTE } from '../Auth/Auth.constants';
import { getAuthApiKey } from '../Auth/Auth.utils';
import UserTenant from '@/modules/System/models/UserTenant';
import { TenantModel } from '@/modules/System/models/TenantModel';

export const IS_TENANT_AGNOSTIC = 'IS_TENANT_AGNOSTIC';

export const TenantAgnosticRoute = () => SetMetadata(IS_TENANT_AGNOSTIC, true);

@Injectable()
export class TenancyGlobalGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private readonly clsService: ClsService,
    @Inject(UserTenant.name)
    private readonly userTenantModel: typeof UserTenant,
    @Inject(TenantModel.name)
    private readonly tenantModel: typeof TenantModel,
  ) {}

  /**
   * Validates the organization ID in the request headers.
   * @param {ExecutionContext} context
   * @returns {Promise<boolean>}
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const organizationId = request.headers['organization-id'];
    const authorization = request.headers['authorization']?.trim();
    const isAuthApiKey = !!getAuthApiKey(authorization || '');

    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_ROUTE,
      [context.getHandler(), context.getClass()],
    );
    const isTenantAgnostic = this.reflector.getAllAndOverride<boolean>(
      IS_TENANT_AGNOSTIC,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic || isTenantAgnostic || isAuthApiKey) {
      return true;
    }
    if (!organizationId) {
      throw new UnauthorizedException('Organization ID is required.');
    }

    const userId = this.clsService.get('userId');
    if (!userId) {
      throw new ForbiddenException(
        'User identity not established for this request',
      );
    }

    const membership = await this.userTenantModel
      .query()
      .findOne({ userId, organizationId })
      .first();

    if (!membership) {
      throw new ForbiddenException(
        'User does not have access to this organization.',
      );
    }

    // Enforce JWT org matches header org
    // Prevents context confusion when user is in multiple orgs
    const jwtOrganizationId = this.clsService.get('organizationId');

    if (
      jwtOrganizationId &&
      organizationId &&
      jwtOrganizationId !== organizationId
    ) {
      throw new UnauthorizedException(
        'Organization header does not match authenticated session. ' +
          'Call /auth/switch-tenant to change organization.',
      );
    }

    const tenant = await this.tenantModel
      .query()
      .findOne({ organizationId })
      .first();

    if (!tenant) {
      throw new ForbiddenException('Organization not found.');
    }

    this.clsService.set('tenantId', tenant.id);
    this.clsService.set('organizationId', organizationId);

    return true;
  }
}
