import { useDispatch, useSelector } from 'react-redux';
import { useCallback } from 'react';
import { isAuthenticated } from '@/store/authentication/authentication.reducer';
import {
  setAuthTenantId,
  setAuthToken,
  setAuthUserId,
  setEmailConfirmed,
  setLogin,
  setOrganizationId,
  setLocale,
} from '@/store/authentication/authentication.actions';
import { useQueryClient } from 'react-query';
import { clearMustChangePasswordCookie, getCookie, removeCookie } from '@/utils';

interface AuthState {
  token: string | null;
  organizationId: string | null;
  tenantId: string | null;
  userId: string | null;
  locale: string;
  verified: boolean;
  verifyEmail: string | null;
}

interface RootAuthSlice {
  authentication: AuthState;
}

/**
 * Removes the authentication cookies.
 */
function removeAuthenticationCookies() {
  removeCookie('token');
  removeCookie('organization_id');
  removeCookie('tenant_id');
  removeCookie('authenticated_user_id');
  removeCookie('locale');
}

export const useAuthActions = () => {
  const dispatch = useDispatch();
  const queryClient = useQueryClient();

  return {
    setLogin: useCallback((_login?: unknown) => dispatch(setLogin()), [dispatch]),
    setLogout: useCallback(() => {
      // Fire-and-forget: revoke the JWT server-side so it can't be replayed.
      const token = getCookie('token', undefined);
      if (token) {
        fetch('/api/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => { /* non-fatal — local cleanup proceeds regardless */ });
      }
      queryClient.clear();
      removeAuthenticationCookies();
      clearMustChangePasswordCookie();
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch {
        // ignore private mode / blocked storage
      }
      // Hard-navigate to login — reload on `/` left a blank shell behind intl/guards.
      window.location.replace('/auth/login');
    }, [queryClient]),
  };
};

/**
 * Retrieve whether the user is authenticated.
 */
export const useIsAuthenticated = () => {
  return useSelector(isAuthenticated);
};

/**
 * Retrieve the authentication token.
 */
export const useAuthToken = () => {
  return useSelector((state: RootAuthSlice) => state.authentication.token);
};

/**
 * Retrieve the authentication user.
 */
export const useAuthUser = () => {
  return useSelector((_state: RootAuthSlice) => ({}));
};

/**
 * Retrieve the authenticated organization id.
 */
export const useAuthOrganizationId = () => {
  return useSelector((state: RootAuthSlice) => state.authentication.organizationId);
};

/**
 * Retrieves the user's email verification status.
 */
export const useAuthUserVerified = () => {
  return useSelector((state: RootAuthSlice) => state.authentication.verified);
};

/**
 * Retrieves the user's email address.
 */
export const useAuthUserVerifyEmail = () => {
  return useSelector((state: RootAuthSlice) => state.authentication.verifyEmail);
};

/**
 * Sets the user's email verification status.
 */
export const useSetAuthEmailConfirmed = () => {
  const dispatch = useDispatch();

  return useCallback(
    (verified: boolean = true, email?: string) =>
      dispatch(setEmailConfirmed(verified, email)),
    [dispatch],
  );
};

export const useSetOrganizationId = () => {
  const dispatch = useDispatch();

  return useCallback(
    (organizationId: string) => dispatch(setOrganizationId(organizationId)),
    [dispatch],
  );
};

export const useSetAuthToken = () => {
  const dispatch = useDispatch();

  return useCallback(
    (authToken: string) => dispatch(setAuthToken(authToken)),
    [dispatch],
  );
};

export const useSetTenantId = () => {
  const dispatch = useDispatch();

  return useCallback(
    (tenantId: string) => dispatch(setAuthTenantId(tenantId)),
    [dispatch],
  );
};

export const useSetAuthUserId = () => {
  const dispatch = useDispatch();

  return useCallback(
    (userId: string) => dispatch(setAuthUserId(userId)),
    [dispatch],
  );
};

export const useSetLocale = () => {
  const dispatch = useDispatch();

  return useCallback(
    (locale: string) => dispatch(setLocale(locale)),
    [dispatch],
  );
};
