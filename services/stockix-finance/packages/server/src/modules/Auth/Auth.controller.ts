import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Request,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiBody,
  ApiParam,
  ApiResponse,
  ApiExtraModels,
  getSchemaPath,
} from '@nestjs/swagger';
import { PublicRoute } from './guards/jwt.guard';
import { AuthenticationApplication } from './AuthApplication.sevice';
import { AuthSignupDto } from './dtos/AuthSignup.dto';
import { AuthSigninDto } from './dtos/AuthSignin.dto';
import { AuthSignupVerifyDto } from './dtos/AuthSignupVerify.dto';
import { AuthSendResetPasswordDto } from './dtos/AuthSendResetPassword.dto';
import { AuthResetPasswordDto } from './dtos/AuthResetPassword.dto';
import { AuthSigninResponseDto } from './dtos/AuthSigninResponse.dto';
import { AuthMetaResponseDto } from './dtos/AuthMetaResponse.dto';
import { LocalAuthGuard } from './guards/Local.guard';
import { AuthSigninService } from './commands/AuthSignin.service';
import { TenantModel } from '../System/models/TenantModel';
import { SystemUser } from '../System/models/SystemUser';
import UserTenant from '../System/models/UserTenant';
import { IgnoreTenantInitializedRoute } from '../Tenancy/EnsureTenantIsInitialized.guard';
import { IgnoreTenantSeededRoute } from '../Tenancy/EnsureTenantIsSeeded.guards';

/** Read JWT exp without adding a jsonwebtoken import (payload is base64url segment 2). */
function impersonateCookieMaxAgeMs(token: string): number {
  const fallback = 24 * 60 * 60 * 1000;
  try {
    const segment = token.split('.')[1];
    if (!segment) return fallback;
    const json = Buffer.from(segment, 'base64url').toString('utf8');
    const payload = JSON.parse(json) as { exp?: number };
    if (typeof payload.exp === 'number') {
      const ms = payload.exp * 1000 - Date.now();
      if (ms > 60_000) return ms;
    }
  } catch {
    /* use fallback */
  }
  return fallback;
}

class ImpersonateBodyDto {
  t!: string;
}

@Controller('/auth')
@ApiTags('Auth')
@ApiExtraModels(AuthSigninResponseDto, AuthMetaResponseDto)
@PublicRoute()
@Throttle({ auth: {} })
export class AuthController {
  constructor(
    private readonly authApp: AuthenticationApplication,
    private readonly authSignin: AuthSigninService,

    @Inject(TenantModel.name)
    private readonly tenantModel: typeof TenantModel,

    @Inject(UserTenant.name)
    private readonly userTenantModel: typeof UserTenant,
  ) { }

  @Post('/signin')
  @UseGuards(LocalAuthGuard)
  @ApiOperation({ summary: 'Sign in a user' })
  @ApiBody({ type: AuthSigninDto })
  @ApiResponse({
    status: 200,
    description: 'Sign-in successful. Returns access token and tenant/organization IDs.',
    schema: { $ref: getSchemaPath(AuthSigninResponseDto) },
  })
  async signin(
    @Request() req: Request & { user: SystemUser },
    @Body() signinDto: AuthSigninDto,
  ): Promise<AuthSigninResponseDto> {
    const { user } = req;

    let organizationId: string | undefined;
    let tenantId: number | undefined;

    const memberships = await this.userTenantModel
      .query()
      .where({ userId: user.id })
      .orderBy('createdAt', 'desc');

    if (user.tenantId) {
      const tenant = await this.tenantModel.query().findById(user.tenantId);
      const primaryMembership = memberships.find(
        (m) => m.tenantId === user.tenantId,
      );
      if (tenant && primaryMembership) {
        organizationId = tenant.organizationId;
        tenantId = tenant.id;
      }
    }

    if (!organizationId && memberships.length > 0) {
      const membership = memberships[0];
      organizationId = membership.organizationId;
      tenantId = membership.tenantId;
    }

    if (!organizationId || tenantId === undefined) {
      throw new UnauthorizedException(
        'No organization found for this user',
      );
    }

    return {
      accessToken: await this.authSignin.signToken(user, organizationId),
      organizationId,
      tenantId,
      userId: user.id,
      mustChangePassword: !!user.mustChangePassword,
    };
  }

  @Post('/signup')
  @ApiOperation({ summary: 'Sign up a new user' })
  @ApiBody({ type: AuthSignupDto })
  @ApiResponse({ status: 201, description: 'Sign-up initiated. Check email for confirmation.' })
  signup(@Request() req: Request, @Body() signupDto: AuthSignupDto) {
    return this.authApp.signUp(signupDto);
  }

  /**
   * Platform provisioning (`FetchStockixFinanceBootstrap`) posts snake_case to `/api/auth/register`.
   * Delegates to the same flow as `/signup`.
   */
  @Post('/register')
  @ApiOperation({ summary: 'Register (provisioning / legacy clients)' })
  @ApiResponse({ status: 201, description: 'Same as signup.' })
  register(@Body() body: Record<string, unknown>) {
    const dto: AuthSignupDto = {
      firstName: String(body.firstName ?? body.first_name ?? ''),
      lastName: String(body.lastName ?? body.last_name ?? ''),
      email: String(body.email ?? ''),
      password: String(body.password ?? ''),
    };
    return this.authApp.signUp(dto);
  }

  @Post('/signup/verify')
  @ApiOperation({ summary: 'Confirm user signup' })
  @ApiBody({ type: AuthSignupVerifyDto })
  @ApiResponse({ status: 200, description: 'Signup confirmed successfully.' })
  signupConfirm(@Body() body: AuthSignupVerifyDto) {
    return this.authApp.signUpConfirm(body.email, body.token);
  }

  @Post('/send_reset_password')
  @ApiOperation({ summary: 'Send reset password email' })
  @ApiBody({ type: AuthSendResetPasswordDto })
  @ApiResponse({ status: 200, description: 'Reset password email sent if the account exists.' })
  sendResetPassword(@Body() body: AuthSendResetPasswordDto) {
    return this.authApp.sendResetPassword(body.email);
  }

  @Post('/reset_password/:token')
  @ApiOperation({ summary: 'Reset password using token' })
  @ApiParam({ name: 'token', description: 'Reset password token from email link' })
  @ApiBody({ type: AuthResetPasswordDto })
  @ApiResponse({ status: 200, description: 'Password reset successfully.' })
  resetPassword(
    @Param('token') token: string,
    @Body() body: AuthResetPasswordDto,
  ) {
    return this.authApp.resetPassword(token, body.password);
  }

  @Get('/meta')
  @ApiOperation({ summary: 'Get auth metadata (e.g. signup disabled)' })
  @ApiResponse({
    status: 200,
    description: 'Auth metadata for the login/signup page.',
    schema: { $ref: getSchemaPath(AuthMetaResponseDto) },
  })
  meta(): Promise<AuthMetaResponseDto> {
    return this.authApp.getAuthMeta();
  }

  /**
   * One-hop session bootstrap: Stockix API obtains a short-lived JWT via server-side
   * sign-in, then redirects the owner’s browser here to persist it as the `token` cookie.
   */
  @Get('/impersonate')
  @IgnoreTenantInitializedRoute()
  @IgnoreTenantSeededRoute()
  @ApiOperation({ summary: 'Set session cookie from a one-time token query param' })
  @ApiResponse({ status: 302, description: 'Cookie set; redirect to app root' })
  @ApiResponse({ status: 400, description: 'Missing or invalid token' })
  impersonate(
    @Query('t') token: string | undefined,
    @Res() res: Response,
  ): void {
    const t = typeof token === 'string' ? token.trim() : '';
    if (t.length < 10) {
      res.status(400).json({ error: 'Invalid token' });
      return;
    }
    const maxAge = impersonateCookieMaxAgeMs(t);
    res.cookie('token', t, {
      httpOnly: false,
      sameSite: 'lax',
      maxAge,
      path: '/',
    });
    res.redirect('/');
  }

  @Post('/impersonate')
  @IgnoreTenantInitializedRoute()
  @IgnoreTenantSeededRoute()
  @ApiOperation({ summary: 'Set session cookie from a one-time token request body' })
  @ApiBody({ type: ImpersonateBodyDto })
  @ApiResponse({ status: 302, description: 'Cookie set; redirect to app root' })
  @ApiResponse({ status: 400, description: 'Missing or invalid token' })
  impersonateViaPost(
    @Body() body: ImpersonateBodyDto,
    @Res() res: Response,
  ): void {
    const t = typeof body?.t === 'string' ? body.t.trim() : '';
    if (t.length < 10) {
      res.status(400).json({ error: 'Invalid token' });
      return;
    }
    const maxAge = impersonateCookieMaxAgeMs(t);
    res.cookie('token', t, {
      httpOnly: false,
      sameSite: 'lax',
      maxAge,
      path: '/',
    });
    res.redirect('/');
  }
}
