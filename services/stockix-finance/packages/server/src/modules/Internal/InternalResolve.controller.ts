import { Controller, Get, HttpCode, HttpStatus, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PublicRoute } from '@/modules/Auth/guards/jwt.guard';
import { TenantAgnosticRoute } from '@/modules/Tenancy/TenancyGlobal.guard';
import { InternalSecretGuard } from './guards/InternalSecret.guard';
import { InternalResolveTenantService } from './commands/InternalResolveTenant.service';

@ApiTags('Internal')
@Controller('internal')
@PublicRoute()
@TenantAgnosticRoute()
@UseGuards(InternalSecretGuard)
export class InternalResolveController {
  constructor(
    private readonly internalResolveTenantService: InternalResolveTenantService,
  ) {}

  @Get('/resolve-tenant')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resolve Finance system tenant id by organization id or admin email',
  })
  async resolveTenant(
    @Query('organizationId') organizationId?: string,
    @Query('email') email?: string,
  ) {
    return this.internalResolveTenantService.resolve({ organizationId, email });
  }
}
