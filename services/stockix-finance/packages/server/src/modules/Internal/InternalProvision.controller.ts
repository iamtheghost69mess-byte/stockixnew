import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PublicRoute } from '@/modules/Auth/guards/jwt.guard';
import { TenantAgnosticRoute } from '@/modules/Tenancy/TenancyGlobal.guard';
import { InternalSecretGuard } from './guards/InternalSecret.guard';
import { ProvisionUserService } from './commands/ProvisionUser.service';
import { InternalCompleteOrganizationSetupService } from './commands/InternalCompleteOrganizationSetup.service';
import {
  ProvisionUserDto,
  ProvisionUserRole,
} from './dtos/ProvisionUser.dto';

@ApiTags('Internal')
@Controller('internal')
@PublicRoute()
@TenantAgnosticRoute()
@UseGuards(InternalSecretGuard)
export class InternalProvisionController {
  constructor(
    private readonly provisionUserService: ProvisionUserService,
    private readonly internalCompleteOrganizationSetupService: InternalCompleteOrganizationSetupService,
  ) {}

  /**
   * Internal user provisioning (replaces public /api/auth/register for workers).
   *
   * curl -X POST http://localhost:3000/api/internal/provision-user \
   *   -H "Content-Type: application/json" \
   *   -H "x-internal-secret: $INTERNAL_API_SECRET" \
   *   -d '{"email":"admin@example.com","first_name":"Jane","last_name":"Doe","password":"secret","role":"admin"}'
   */
  @Post('/provision-user')
  @HttpCode(HttpStatus.CREATED)
  async provisionUser(@Body() body: Record<string, unknown>) {
    const dto: ProvisionUserDto = {
      email: String(body.email ?? ''),
      firstName: String(body.firstName ?? body.first_name ?? ''),
      lastName: String(body.lastName ?? body.last_name ?? ''),
      password: String(body.password ?? ''),
      role: this.parseRole(body.role),
      organizationNumber: body.organizationNumber
        ? String(body.organizationNumber)
        : body.organization_number
          ? String(body.organization_number)
          : undefined,
    };

    const tenantIdRaw = body.tenantId ?? body.tenant_id;
    if (tenantIdRaw !== undefined && tenantIdRaw !== null && tenantIdRaw !== '') {
      const tenantId = Number(tenantIdRaw);
      if (!Number.isNaN(tenantId) && tenantId > 0) {
        dto.tenantId = tenantId;
      }
    }

    return this.provisionUserService.provisionUser(dto);
  }

  @Post('/organization/setup/complete')
  @HttpCode(HttpStatus.OK)
  async completeOrganizationSetup(@Body() body: Record<string, unknown>) {
    const tenantIdRaw = body.tenantId ?? body.tenant_id;
    const tenantId = Number(tenantIdRaw);
    if (!Number.isFinite(tenantId) || tenantId <= 0) {
      throw new Error('tenant_id_required');
    }
    return this.internalCompleteOrganizationSetupService.executeForTenantId(tenantId);
  }

  private parseRole(value: unknown): ProvisionUserRole {
    const role = String(value ?? ProvisionUserRole.Admin).toLowerCase();
    if (role === ProvisionUserRole.Accountant) {
      return ProvisionUserRole.Accountant;
    }
    if (role === ProvisionUserRole.Viewer) {
      return ProvisionUserRole.Viewer;
    }
    return ProvisionUserRole.Admin;
  }
}
