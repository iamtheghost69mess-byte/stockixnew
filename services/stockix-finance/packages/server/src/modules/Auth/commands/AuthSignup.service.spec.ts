import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ERRORS } from '../Auth.constants';
import { AuthSignupService } from './AuthSignup.service';

describe('AuthSignupService signup restrictions', () => {
  const buildService = (disabled: boolean) => {
    const configService = {
      get: (key: string) => {
        if (key === 'signupRestrictions') {
          return { disabled, allowedEmails: [], allowedDomains: [] };
        }
        if (key === 'signupConfirmation') {
          return { enabled: false };
        }
        return undefined;
      },
    } as unknown as ConfigService;

    return new AuthSignupService(
      configService,
      { emit: jest.fn() } as never,
      {} as never,
      { get: jest.fn() } as never,
      {} as never,
      {} as never,
    );
  };

  it('throws 403 when signup is disabled', async () => {
    const service = buildService(true);
    await expect(
      service.signUp({
        email: 'any@example.com',
        firstName: 'A',
        lastName: 'B',
        password: 'password123',
      } as never),
    ).rejects.toMatchObject({
      errorType: ERRORS.SIGNUP_RESTRICTED,
      httpStatus: HttpStatus.FORBIDDEN,
    });
  });
});
