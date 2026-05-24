// @ts-nocheck
import { Route, Switch, useLocation } from 'react-router-dom';
import BodyClassName from 'react-body-classname';
import styled from 'styled-components';
import { Suspense } from 'react';
import { TransitionGroup, CSSTransition } from 'react-transition-group';
import { Spinner } from '@blueprintjs/core';

import authenticationRoutes from '@/routes/authentication';
import { Box, FormattedMessage as T } from '@/components';
import { AuthMetaBootProvider } from './AuthMetaBoot';

import '@/style/pages/Authentication/Auth.scss';
import { StockixLogo } from '@/components/Icons/StockixLogo';

export function Authentication() {
  // BodyClassName replaces body.className — always restore Stockix dark default on auth routes.
  return (
    <BodyClassName className="authentication bp4-dark">
      <AuthPage>
        <AuthInsider>
          <AuthLogo>
            <StockixLogo
              height={37}
              width={214}
              color="rgba(255, 255, 255, 0.6)"
            />
          </AuthLogo>

          <AuthMetaBootProvider>
            <Suspense
              fallback={
                <Box style={{ marginTop: '5rem' }}>
                  <Spinner size={30} />
                </Box>
              }
            >
              <AuthenticationRoutes />
            </Suspense>
          </AuthMetaBootProvider>
        </AuthInsider>
      </AuthPage>
    </BodyClassName>
  );
}

function AuthenticationRoutes() {
  const location = useLocation();
  const locationKey = location.pathname;

  return (
    <TransitionGroup>
      <CSSTransition
        timeout={500}
        key={locationKey}
        classNames="authTransition"
      >
        <Switch>
          {authenticationRoutes.map((route, index) => (
            <Route
              key={index}
              path={route.path}
              exact={route.exact}
              component={route.component}
            />
          ))}
        </Switch>
      </CSSTransition>
    </TransitionGroup>
  );
}

const AuthPage = styled.div``;
const AuthInsider = styled.div`
  width: 384px;
  margin: 0 auto;
  margin-bottom: 40px;
  padding-top: 80px;
`;

const AuthLogo = styled.div`
  text-align: center;
  margin-bottom: 40px;
`;
