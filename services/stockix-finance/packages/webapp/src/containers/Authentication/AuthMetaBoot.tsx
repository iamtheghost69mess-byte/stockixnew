// @ts-nocheck
import React, { createContext } from 'react';
import { useAuthMetadata } from '@/hooks/query';
import { Spinner } from '@blueprintjs/core';
import styled from 'styled-components';

const AuthMetaBootContext = createContext();

/**
 * Boots the authentication page metadata.
 */
function AuthMetaBootProvider({ ...props }) {
  const { isLoading: isAuthMetaLoading, data: authMeta } = useAuthMetadata();

  const signupDisabledFromApi =
    authMeta?.signupDisabled ?? authMeta?.meta?.signup_disabled;

  const state = {
    isAuthMetaLoading,
    // Driven by server SIGNUP_DISABLED env via GET /auth/meta. Default true (Stockix policy).
    signupDisabled:
      signupDisabledFromApi === undefined
        ? true
        : Boolean(signupDisabledFromApi),
  };

  if (isAuthMetaLoading) {
    return (
      <SpinnerRoot>
        <Spinner size={30} value={null} />
      </SpinnerRoot>
    );
  }
  return <AuthMetaBootContext.Provider value={state} {...props} />;
}

const useAuthMetaBoot = () => React.useContext(AuthMetaBootContext);

export { AuthMetaBootContext, AuthMetaBootProvider, useAuthMetaBoot };

const SpinnerRoot = styled.div`
  margin-top: 5rem;
`;
