import {
  ApiBody,
  ApiExcludeController,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { GetAuthenticatedAccount } from './queries/GetAuthedAccount.service';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { SwitchTenantDto } from './dtos/SwitchTenant.dto';
import { AuthChangePasswordDto } from './dtos/AuthChangePassword.dto';
import { Throttle } from '@nestjs/throttler';
import { TenantAgnosticRoute } from '../Tenancy/TenancyGlobal.guard';
import { AuthenticationApplication } from './AuthApplication.sevice';
import { IgnoreUserVerifiedRoute } from './guards/EnsureUserVerified.guard';

@Controller('/auth')
@ApiTags('Auth')
@TenantAgnosticRoute()
@IgnoreUserVerifiedRoute()
@Throttle({ auth: {} })
export class AuthedController {
  constructor(
    private readonly getAuthedAccountService: GetAuthenticatedAccount,
    private readonly authApp: AuthenticationApplication,
  ) { }

  @Post('/signup/verify/resend')
  @ApiOperation({ summary: 'Resend the signup confirmation message' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        code: { type: 'number', example: 200 },
        message: { type: 'string', example: 'resent successfully.' },
      },
    },
  })
  async resendSignupConfirm() {
    await this.authApp.signUpConfirmResend();

    return {
      code: 200,
      message: 'The signup confirmation message has been resent successfully.',
    };
  }

  @Get('/account')
  @ApiOperation({ summary: 'Retrieve the authenticated account' })
  async getAuthedAcccount() {
    return this.getAuthedAccountService.getAccount();
  }

  @Get('/my-tenants')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List organizations the authenticated user belongs to' })
  async getMyTenants() {
    return this.authApp.listMyTenants();
  }

  @Post('/switch-tenant')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Switch active organization and issue a new JWT' })
  async switchTenant(@Body() body: SwitchTenantDto) {
    return this.authApp.switchTenant(body.organizationId);
  }

  @Post('/change_password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change password for the authenticated user' })
  @ApiBody({ type: AuthChangePasswordDto })
  async changePassword(@Body() body: AuthChangePasswordDto) {
    await this.authApp.changePassword(body.password);
    return { success: true };
  }
}
