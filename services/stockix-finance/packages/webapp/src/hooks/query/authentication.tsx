import { useMutation, UseMutationOptions } from 'react-query';
import useApiRequest, { useAuthApiRequest } from '../useRequest';
import { clearMustChangePasswordCookie, removeCookie, setCookie } from '../../utils';
import { useRequestQuery } from '../useQueryRequest';
import t from './types';

const AuthRoute = {
  Signin: 'auth/signin',
  Signup: 'auth/signup',
  SignupVerify: 'auth/signup/verify',
  SignupVerifyResend: 'auth/signup/verify/resend',
  SendResetPassword: 'auth/send_reset_password',
  ChangePassword: 'auth/change_password',
  ForgetPassword: 'auth/reset_password/:token',
  AuthMeta: 'auth/meta',
};

interface AuthLoginResponse {
  access_token: string;
  organization_id: string;
  tenant_id: number;
  user_id: number;
  must_change_password?: boolean;
  tenant?: { metadata?: { language?: string } };
}

interface AuthLoginValues {
  email: string;
  password: string;
}

interface AuthSignupValues {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

interface AuthChangePasswordValues {
  password: string;
}

interface AuthSignUpVerifyValues {
  token: string;
  email: string;
}

/**
 * Saves the response data to cookies.
 */
export function setAuthLoginCookies(data: AuthLoginResponse) {
  setCookie('token', data.access_token);
  setCookie('authenticated_user_id', String(data.user_id));
  setCookie('organization_id', data.organization_id);
  setCookie('tenant_id', String(data.tenant_id));

  if (data.must_change_password) {
    setCookie('must_change_password', '1', 1);
  } else {
    clearMustChangePasswordCookie();
  }

  if (data?.tenant?.metadata?.language) {
    setCookie('locale', data.tenant.metadata.language);
  }
}

/**
 * Authentication login.
 */
export const useAuthLogin = (
  props?: UseMutationOptions<{ data: AuthLoginResponse }, Error, AuthLoginValues>,
) => {
  const apiRequest = useAuthApiRequest();

  return useMutation<{ data: AuthLoginResponse }, Error, AuthLoginValues>(
    (values) => apiRequest.post(AuthRoute.Signin, values),
    {
      onSuccess: (res) => {
        setAuthLoginCookies(res.data);

        if (res.data?.must_change_password) {
          window.location.href = '/auth/change-password?required=true';
          return;
        }

        const params = new URLSearchParams(window.location.search);
        const redirect = params.get('redirect');
        if (redirect) {
          const decoded = decodeURIComponent(redirect);
          if (decoded.startsWith('/') && !decoded.startsWith('//')) {
            window.location.href = decoded;
            return;
          }
        }

        window.location.href = '/';
      },
      ...props,
    },
  );
};

/**
 * Authentication register.
 */
export const useAuthRegister = (
  props?: UseMutationOptions<unknown, Error, AuthSignupValues>,
) => {
  const apiRequest = useAuthApiRequest();

  return useMutation<unknown, Error, AuthSignupValues>(
    (values) => apiRequest.post(AuthRoute.Signup, values),
    props,
  );
};

/**
 * Change password while authenticated (bootstrap / must-change flow).
 */
export const useAuthChangePassword = (
  props?: UseMutationOptions<{ data: { must_change_password?: boolean } }, Error, AuthChangePasswordValues>,
) => {
  const apiRequest = useApiRequest();

  return useMutation<{ data: { must_change_password?: boolean } }, Error, AuthChangePasswordValues>(
    (values) => apiRequest.post(AuthRoute.ChangePassword, values),
    {
      onSuccess: (res) => {
        if (res?.data?.must_change_password === false) {
          clearMustChangePasswordCookie();
        }
      },
      ...props,
    },
  );
};

/**
 * Authentication send reset password.
 */
export const useAuthSendResetPassword = (
  props?: UseMutationOptions<unknown, Error, { email: string }>,
) => {
  const apiRequest = useAuthApiRequest();

  return useMutation<unknown, Error, { email: string }>(
    (values) => apiRequest.post(AuthRoute.SendResetPassword, values),
    props,
  );
};

/**
 * Authentication reset password.
 */
export const useAuthResetPassword = (
  props?: UseMutationOptions<unknown, Error, [string, { password: string }]>,
) => {
  const apiRequest = useAuthApiRequest();

  return useMutation<unknown, Error, [string, { password: string }]>(
    ([token, values]) => apiRequest.post(`auth/reset_password/${token}`, values),
    props,
  );
};

/**
 * Fetches the authentication page metadata.
 */
export const useAuthMetadata = (props = {}) => {
  return useRequestQuery(
    [t.AUTH_METADATA_PAGE],
    {
      method: 'get',
      url: AuthRoute.AuthMeta,
    },
    {
      select: (res: { data: unknown }) => res.data,
      defaultData: {},
      requiresAuth: false,
      ...props,
    },
  );
};

/**
 * Resend the mail of signup verification.
 */
export const useAuthSignUpVerifyResendMail = (
  props?: UseMutationOptions<unknown, Error, void>,
) => {
  const apiRequest = useApiRequest();

  return useMutation<unknown, Error, void>(
    () => apiRequest.post(AuthRoute.SignupVerifyResend),
    props,
  );
};

/**
 * Signup verification.
 */
export const useAuthSignUpVerify = (
  props?: UseMutationOptions<unknown, Error, AuthSignUpVerifyValues>,
) => {
  const apiRequest = useAuthApiRequest();

  return useMutation<unknown, Error, AuthSignUpVerifyValues>(
    (values) => apiRequest.post(AuthRoute.SignupVerify, values),
    props,
  );
};
