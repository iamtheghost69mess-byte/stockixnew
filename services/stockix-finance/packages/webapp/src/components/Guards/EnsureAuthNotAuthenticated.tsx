// @ts-nocheck
import React from 'react';
import { Redirect, useLocation } from 'react-router-dom';
import { useIsAuthenticated } from '@/hooks/state';
import { getCookie } from '@/utils';

interface EnsureAuthNotAuthenticatedProps {
  children: React.ReactNode;
  redirectTo?: string;
}

export function EnsureAuthNotAuthenticated({
  children,
  redirectTo = '/',
}: EnsureAuthNotAuthenticatedProps) {
  const isAuthenticated = useIsAuthenticated();
  const location = useLocation();
  const mustChangePassword = getCookie('must_change_password') === '1';

  if (!isAuthenticated) {
    return <>{children}</>;
  }

  if (
    mustChangePassword &&
    location.pathname !== '/auth/change-password'
  ) {
    return (
      <Redirect
        to={{ pathname: '/auth/change-password', search: '?required=true' }}
      />
    );
  }

  const params = new URLSearchParams(location.search);
  const redirectParam = params.get('redirect');
  const destination = redirectParam
    ? decodeURIComponent(redirectParam)
    : redirectTo;

  return <Redirect to={destination} />;
}
