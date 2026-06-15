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
import { AttachUserToTenantService } from './commands/AttachUserToTenant.service';
import { AttachUserToTenantDto } from './dtos/AttachUserToTenant.dto';

@ApiTags('Internal')
@Controller('internal')
@PublicRoute()
@TenantAgnosticRoute()
export class InternalController {
  constructor(
    private readonly attachUserToTenantService: AttachUserToTenantService,
  ) {}

  @Post('/attach-user-to-tenant')
  @HttpCode(HttpStatus.OK)
  @UseGuards(InternalSecretGuard)
  async attachUserToTenant(@Body() body: AttachUserToTenantDto) {
    await this.attachUserToTenantService.attachUser({
      email: body.email,
      organizationId: body.organizationId,
    });
    return { success: true };
  }
}
