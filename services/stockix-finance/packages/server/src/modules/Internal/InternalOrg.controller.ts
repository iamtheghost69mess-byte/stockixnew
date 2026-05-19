import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PublicRoute } from '@/modules/Auth/guards/jwt.guard';
import { TenantAgnosticRoute } from '@/modules/Tenancy/TenancyGlobal.guard';
import { InternalSecretGuard } from './guards/InternalSecret.guard';
import { CopyParentTenantSettingsService } from '@/modules/Organization/CopyParentTenantSettings.service';
import { Inject } from '@nestjs/common';
import { TenantModel } from '@/modules/System/models/TenantModel';

@ApiTags('Internal')
@Controller('internal/tenants')
@PublicRoute()
@TenantAgnosticRoute()
@UseGuards(InternalSecretGuard)
export class InternalOrgController {
  constructor(
    private readonly copyParentTenantSettingsService: CopyParentTenantSettingsService,
    @Inject(TenantModel.name)
    private readonly tenantModel: typeof TenantModel,
  ) {}

  @Post(':tenantId/copy-from/:parentTenantId')
  @HttpCode(HttpStatus.OK)
  async copyFromParent(
    @Param('tenantId', ParseIntPipe) tenantId: number,
    @Param('parentTenantId', ParseIntPipe) parentTenantId: number,
  ) {
    return this.copyParentTenantSettingsService.copyFromParent(
      tenantId,
      parentTenantId,
    );
  }

  @Post(':tenantId/set-parent')
  @HttpCode(HttpStatus.OK)
  async setParent(
    @Param('tenantId', ParseIntPipe) tenantId: number,
    @Body() body: Record<string, unknown>,
  ) {
    const parentTenantId = Number(body.parentTenantId ?? body.parent_tenant_id);
    await this.tenantModel
      .query()
      .patch({ parentTenantId })
      .where({ id: tenantId });

    return { success: true, tenantId, parentTenantId };
  }
}
