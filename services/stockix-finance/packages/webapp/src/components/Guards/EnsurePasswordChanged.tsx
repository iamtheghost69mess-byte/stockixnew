// @ts-nocheck
import React from 'react';
import { Redirect } from 'react-router-dom';
import { getCookie } from '@/utils';

interface EnsurePasswordChangedProps {
  children: React.ReactNode;
}

/**
 * Redirects bootstrap/provisioned users to set a new password before using the app.
 */
export function EnsurePasswordChanged({ children }: EnsurePasswordChangedProps) {
  const mustChange = getCookie('must_change_password') === '1';

  if (mustChange) {
    return <Redirect to="/auth/change-password?required=true" />;
  }

  return <>{children}</>;
}
