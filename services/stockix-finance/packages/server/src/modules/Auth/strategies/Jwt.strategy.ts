import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthSigninService } from '../commands/AuthSignin.service';
import { AuthLogoutService } from '../commands/AuthLogout.service';
import { JwtPayload } from '../Auth.interfaces';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly authSigninService: AuthSigninService,
    private readonly authLogout: AuthLogoutService,
    private readonly configService: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('jwt.secret'),
    });
  }

  async validate(payload: JwtPayload) {
    if (payload.jti && await this.authLogout.isDenied(payload.jti)) {
      throw new UnauthorizedException('Token has been revoked');
    }
    return this.authSigninService.verifyPayload(payload);
  }
}
