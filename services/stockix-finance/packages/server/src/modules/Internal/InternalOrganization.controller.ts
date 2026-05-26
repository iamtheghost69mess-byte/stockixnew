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
import { InternalSyncOrganizationBrandingService } from './commands/InternalSyncOrganizationBranding.service';

@ApiTags('Internal')
@Controller('internal/organization')
@PublicRoute()
@TenantAgnosticRoute()
@UseGuards(InternalSecretGuard)
export class InternalOrganizationController {
  constructor(
    private readonly syncBrandingService: InternalSyncOrganizationBrandingService,
  ) {}

  @Post('branding/sync')
  @HttpCode(HttpStatus.OK)
  async syncBranding(@Body() body: Record<string, unknown>) {
    const tenantId = Number(body.tenantId ?? body.tenant_id);
    return this.syncBrandingService.sync({
      tenantId,
      name: typeof body.name === 'string' ? body.name : undefined,
      primaryColor:
        body.primaryColor === null || typeof body.primaryColor === 'string'
          ? (body.primaryColor as string | null)
          : typeof body.primary_color === 'string'
            ? body.primary_color
            : body.primary_color === null
              ? null
              : undefined,
      logoUrl:
        body.logoUrl === null || typeof body.logoUrl === 'string'
          ? (body.logoUrl as string | null)
          : typeof body.logo_url === 'string'
            ? body.logo_url
            : body.logo_url === null
              ? null
              : undefined,
    });
  }
}
