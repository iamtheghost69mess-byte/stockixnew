// @ts-nocheck
import React, { useEffect } from 'react';
import {
  useAuthenticatedAccount,
  useCurrentOrganization,
  useDashboardMeta,
} from '@/hooks/query';
import { useSetLocale, useSplashLoading } from '@/hooks/state';
import { useWatch, useWatchImmediate, useWhen } from '@/hooks';
import { setCookie, getCookie } from '@/utils';

/**
 * Dashboard meta async booting.
 *  - Fetches the dashboard meta in booting state.
 *  - Once the dashboard meta query started loading display dashboard splash screen.
 */
export function useDashboardMetaBoot() {
  const {
    data: dashboardMeta,
    isLoading: isDashboardMetaLoading,
    isSuccess: isDashboardMetaSuccess,
    // ORIGINAL: isError was not tracked; a failed boot (400 from EnsureTenantIsInitialized)
    // left the splash screen permanently visible because stopLoading was only called on success.
    isError: isDashboardMetaError,
  } = useDashboardMeta({
    keepPreviousData: true,
  });
  const [startLoading, stopLoading] = useSplashLoading();

  useWatchImmediate((value) => {
    value && startLoading();
  }, isDashboardMetaLoading);

  useWatchImmediate(() => {
    isDashboardMetaSuccess && stopLoading();
  }, isDashboardMetaSuccess);

  // Stop splash on error so the screen doesn't freeze when boot returns 400/5xx.
  useWatchImmediate((value) => {
    value && stopLoading();
  }, isDashboardMetaError);

  return {
    meta: dashboardMeta,
    isLoading: isDashboardMetaLoading,
    isSuccess: isDashboardMetaSuccess,
  };
}

/**
 * Application async booting.
 */
export function useApplicationBoot() {
  // Fetches the current user's organization.
  const {
    isSuccess: isCurrentOrganizationSuccess,
    isLoading: isOrgLoading,
    data: organization,
  } = useCurrentOrganization();

  // Authenticated user.
  const { isSuccess: isAuthUserSuccess, isLoading: isAuthUserLoading } =
    useAuthenticatedAccount();

  // Is the dashboard booted.
  const isBooted = React.useRef(false);
  const setLocale = useSetLocale();

  const orgLanguage = organization?.metadata?.language;

  const normalizeLocale = (value) => {
    const raw = String(value || 'en').trim().toLowerCase();
    return raw.split('-')[0] || 'en';
  };

  // Sync locale cookie and Redux with organization language (no full-page reload).
  React.useEffect(() => {
    if (!orgLanguage) {
      return;
    }
    const desiredLocale = normalizeLocale(orgLanguage);
    const currentLocale = normalizeLocale(getCookie('locale', 'en'));
    if (currentLocale === desiredLocale) {
      return;
    }
    setCookie('locale', desiredLocale);
    setLocale(desiredLocale);
  }, [orgLanguage, setLocale]);

  const [startLoading, stopLoading] = useSplashLoading();

  // Splash loading when organization request loading and
  // application still not booted.
  useWatchImmediate((value) => {
    value && !isBooted.current && startLoading();
  }, isOrgLoading);

  // Splash loading when request authenticated user loading and
  // application still not booted yet.
  useWatchImmediate((value) => {
    value && !isBooted.current && startLoading();
  }, isAuthUserLoading);

  // Stop splash loading once organization request success.
  useWatch((value) => {
    value && stopLoading();
  }, isCurrentOrganizationSuccess);

  // Stop splash loading once authenticated user request success.
  useWatch((value) => {
    value && stopLoading();
  }, isAuthUserSuccess);

  // Once the all requests complete change the app loading state.
  useWhen(
    isAuthUserSuccess &&
      isCurrentOrganizationSuccess &&
      (!orgLanguage
        || normalizeLocale(getCookie('locale', 'en'))
          === normalizeLocale(orgLanguage)),
    () => {
      isBooted.current = true;
    },
  );
  // Reset the loading states once the hook unmount.
  useEffect(
    () => () => {
      isAuthUserLoading && !isBooted.current && stopLoading();
      isOrgLoading && !isBooted.current && stopLoading();
    },
    [isAuthUserLoading, isOrgLoading, stopLoading],
  );

  return {
    isLoading: isOrgLoading || isAuthUserLoading,
  };
}
