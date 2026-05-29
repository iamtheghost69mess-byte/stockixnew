// @ts-nocheck
import { Route, Switch, useLocation } from 'react-router-dom';
import { Suspense } from 'react';
import { TransitionGroup, CSSTransition } from 'react-transition-group';
import { Spinner } from '@blueprintjs/core';

import authenticationRoutes from '@/routes/authentication';
import { Box } from '@/components';
import { AuthPageShell } from './AuthPageShell';

export function Authentication() {
  return (
    <AuthPageShell>
      <Suspense
        fallback={
          <Box style={{ marginTop: '5rem' }}>
            <Spinner size={30} />
          </Box>
        }
      >
        <AuthenticationRoutes />
      </Suspense>
    </AuthPageShell>
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
