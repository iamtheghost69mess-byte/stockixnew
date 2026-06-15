import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PublicRoute } from '@/modules/Auth/guards/jwt.guard';
import { TenantAgnosticRoute } from '@/modules/Tenancy/TenancyGlobal.guard';
import { InternalSecretGuard } from './guards/InternalSecret.guard';
import {
  InternalUsersService,
  CreateInternalUserDto,
  UpdateInternalUserDto,
  InviteInternalUserDto,
} from './commands/InternalUsers.service';

@ApiTags('Internal')
@Controller('internal/tenants')
@PublicRoute()
@TenantAgnosticRoute()
@UseGuards(InternalSecretGuard)
export class InternalUsersController {
  constructor(private readonly internalUsersService: InternalUsersService) {}

  @Post(':tenantId/users/invite')
  @HttpCode(HttpStatus.CREATED)
  async inviteUser(
    @Param('tenantId', ParseIntPipe) tenantId: number,
    @Body() body: Record<string, unknown>,
  ) {
    const dto: InviteInternalUserDto = {
      email: String(body.email ?? ''),
      roleId: Number(body.roleId ?? body.role_id),
      firstName:
        body.firstName !== undefined
          ? String(body.firstName)
          : body.first_name !== undefined
            ? String(body.first_name)
            : undefined,
      lastName:
        body.lastName !== undefined
          ? String(body.lastName)
          : body.last_name !== undefined
            ? String(body.last_name)
            : undefined,
    };
    return this.internalUsersService.sendInvite(tenantId, dto);
  }

  @Post(':tenantId/users')
  @HttpCode(HttpStatus.CREATED)
  async createUser(
    @Param('tenantId', ParseIntPipe) tenantId: number,
    @Body() body: Record<string, unknown>,
  ) {
    const dto: CreateInternalUserDto = {
      email: String(body.email ?? ''),
      firstName: String(body.firstName ?? body.first_name ?? ''),
      lastName: String(body.lastName ?? body.last_name ?? ''),
      password: String(body.password ?? ''),
      roleId: Number(body.roleId ?? body.role_id),
    };
    return this.internalUsersService.createUser(tenantId, dto);
  }

  @Get(':tenantId/users')
  async listUsers(@Param('tenantId', ParseIntPipe) tenantId: number) {
    const users = await this.internalUsersService.listUsers(tenantId);
    return { users };
  }

  @Patch(':tenantId/users/:userId')
  async updateUser(
    @Param('tenantId', ParseIntPipe) tenantId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body: Record<string, unknown>,
  ) {
    const dto: UpdateInternalUserDto = {};
    if (body.roleId !== undefined || body.role_id !== undefined) {
      dto.roleId = Number(body.roleId ?? body.role_id);
    }
    if (body.isActive !== undefined || body.is_active !== undefined) {
      dto.isActive = Boolean(body.isActive ?? body.is_active);
    }
    if (body.firstName !== undefined || body.first_name !== undefined) {
      dto.firstName = String(body.firstName ?? body.first_name);
    }
    if (body.lastName !== undefined || body.last_name !== undefined) {
      dto.lastName = String(body.lastName ?? body.last_name);
    }
    return this.internalUsersService.updateUser(tenantId, userId, dto);
  }

  @Delete(':tenantId/users/:userId')
  async deleteUser(
    @Param('tenantId', ParseIntPipe) tenantId: number,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.internalUsersService.deleteUser(tenantId, userId);
  }

  @Post(':tenantId/users/:userId/reset-password')
  async resetPassword(
    @Param('tenantId', ParseIntPipe) tenantId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body: Record<string, unknown>,
  ) {
    return this.internalUsersService.resetPassword(
      tenantId,
      userId,
      String(body.newPassword ?? body.new_password ?? ''),
    );
  }

  @Post(':tenantId/users/:userId/suspend')
  async suspendUser(
    @Param('tenantId', ParseIntPipe) tenantId: number,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.internalUsersService.setMembershipActive(tenantId, userId, false);
  }

  @Post(':tenantId/users/:userId/activate')
  async activateUser(
    @Param('tenantId', ParseIntPipe) tenantId: number,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.internalUsersService.setMembershipActive(tenantId, userId, true);
  }
}
