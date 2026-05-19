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
import { SyncLicenseService } from './commands/SyncLicense.service';
import { SyncLicenseDto } from './dtos/SyncLicense.dto';
import { TenantLicenseStatus } from '@/modules/System/models/TenantLicense';

@ApiTags('Internal')
@Controller('internal')
@PublicRoute()
@TenantAgnosticRoute()
export class InternalLicenseController {
  constructor(private readonly syncLicenseService: SyncLicenseService) {}

  @Post('/license/sync')
  @HttpCode(HttpStatus.OK)
  @UseGuards(InternalSecretGuard)
  async syncLicense(@Body() body: Record<string, unknown>) {
    const dto: SyncLicenseDto = {
      tenantId: Number(body.tenantId ?? body.tenant_id),
      planSlug: String(body.planSlug ?? body.plan_slug ?? 'owner-managed'),
      status: this.parseStatus(body.status),
      validFrom: String(body.validFrom ?? body.valid_from ?? new Date().toISOString()),
      expiresAt:
        body.expiresAt === null || body.expires_at === null
          ? null
          : body.expiresAt || body.expires_at
            ? String(body.expiresAt ?? body.expires_at)
            : null,
      gracePeriodDays: Number(body.gracePeriodDays ?? body.grace_period_days ?? 30),
      maxUsers: Number(body.maxUsers ?? body.max_users ?? 10),
      maxOrganizations: Number(
        body.maxOrganizations ?? body.max_organizations ?? 1,
      ),
      isPerpetual: Boolean(body.isPerpetual ?? body.is_perpetual ?? false),
      featureFlags: this.parseFeatureFlags(body.featureFlags ?? body.feature_flags),
    };

    return this.syncLicenseService.sync(dto);
  }

  private parseStatus(value: unknown): TenantLicenseStatus {
    const status = String(value ?? 'active').toLowerCase();
    if (
      status === 'expired' ||
      status === 'suspended' ||
      status === 'grace'
    ) {
      return status;
    }
    return 'active';
  }

  private parseFeatureFlags(
    value: unknown,
  ): Record<string, boolean> | null {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, boolean>;
    }
    return null;
  }
}
