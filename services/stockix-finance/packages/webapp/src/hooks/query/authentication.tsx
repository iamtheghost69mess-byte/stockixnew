// @ts-nocheck
import { useMutation } from 'react-query';
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

/**
 * Saves the response data to cookies.
 */
export function setAuthLoginCookies(data) {
  setCookie('token', data.access_token);
  setCookie('authenticated_user_id', data.user_id);
  setCookie('organization_id', data.organization_id);
  setCookie('tenant_id', data.tenant_id);

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
export const useAuthLogin = (props) => {
  const apiRequest = useAuthApiRequest();

  return useMutation((values) => apiRequest.post(AuthRoute.Signin, values), {
    onSuccess: (res) => {
      // Set authentication cookies.
      setAuthLoginCookies(res.data);

      if (res.data?.must_change_password) {
        window.location.href = '/auth/change-password?required=true';
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const redirect = params.get('redirect');
      if (redirect) {
        window.location.href = decodeURIComponent(redirect);
        return;
      }

      // Hard-navigate so cookies and Redux are stable before boot queries fire.
      window.location.href = '/';
    },
    ...props,
  });
};

/**
 * Authentication register.
 */
export const useAuthRegister = (props) => {
  const apiRequest = useAuthApiRequest();

  return useMutation(
    (values) => apiRequest.post(AuthRoute.Signup, values),
    props,
  );
};

/**
 * Change password while authenticated (bootstrap / must-change flow).
 */
export const useAuthChangePassword = (props) => {
  const apiRequest = useApiRequest();

  return useMutation(
    (values: { password: string }) =>
      apiRequest.post(AuthRoute.ChangePassword, values),
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
export const useAuthSendResetPassword = (props) => {
  const apiRequest = useAuthApiRequest();

  return useMutation(
    (values) => apiRequest.post(AuthRoute.SendResetPassword, values),
    props,
  );
};

/**
 * Authentication reset password.
 */
export const useAuthResetPassword = (props) => {
  const apiRequest = useAuthApiRequest();

  return useMutation(
    ([token, values]) => apiRequest.post(`auth/reset/${token}`, values),
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
      select: (res) => res.data,
      defaultData: {},
      requiresAuth: false,
      ...props,
    },
  );
};

/**
 * Resend the mail of signup verification.
 */
export const useAuthSignUpVerifyResendMail = (props) => {
  const apiRequest = useApiRequest();

  return useMutation(
    () => apiRequest.post(AuthRoute.SignupVerifyResend),
    props,
  );
};

interface AuthSignUpVerifyValues {
  token: string;
  email: string;
}

/**
 * Signup verification.
 */
export const useAuthSignUpVerify = (props) => {
  const apiRequest = useAuthApiRequest();

  return useMutation(
    (values: AuthSignUpVerifyValues) =>
      apiRequest.post(AuthRoute.SignupVerify, values),
    props,
  );
};
