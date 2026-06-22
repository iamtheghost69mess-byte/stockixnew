import { ModelObject } from 'objection';
import { SystemUser } from '../System/models/SystemUser';
import { TenantModel } from '../System/models/TenantModel';
import { AuthSignupDto } from './dtos/AuthSignup.dto';

export interface JwtPayload {
  sub: string;
  organizationId: string;
  /** Unique token ID — used by the logout denylist to revoke a specific token. */
  jti?: string;
  iat?: number;
  exp?: number;
}

export interface IAuthSignedInEventPayload {}
export interface IAuthSigningInEventPayload {}
export interface IAuthSignInPOJO {}

export interface IAuthSigningInEventPayload {
  email: string;
  password: string;
  user: ModelObject<SystemUser>;
}

export interface IAuthSignedInEventPayload {
  email: string;
  password: string;
  user: ModelObject<SystemUser>;
}

export interface IAuthSigningUpEventPayload {
  signupDTO: AuthSignupDto;
}

export interface IAuthSignedUpEventPayload {
  signupDTO: AuthSignupDto;
  tenant: TenantModel;
  user: SystemUser;
}

export interface IAuthSignInPOJO {
  user: ModelObject<SystemUser>;
  token: string;
  tenant: ModelObject<TenantModel>;
}

export interface IAuthResetedPasswordEventPayload {
  user: SystemUser;
  token: string;
  password: string;
}

export interface IAuthSendingResetPassword {
  user: SystemUser;
  token: string;
}

export interface IAuthSendedResetPassword {
  user: SystemUser;
  token: string;
}

export interface IAuthGetMetaPOJO {
  signupDisabled: boolean;
  licenseStatus: string | null;
  licenseExpiresAt: string | null;
  licenseGracePeriodEndsAt: string | null;
  billingEnabled: boolean;
}

export interface IAuthSignUpVerifingEventPayload {
  email: string;
  verifyToken: string;
  userId: number;
}

export interface IAuthSignUpVerifiedEventPayload {
  email: string;
  verifyToken: string;
  userId: number;
}

export interface ISignUpConfigmResendedEventPayload {
  user: SystemUser;
}
