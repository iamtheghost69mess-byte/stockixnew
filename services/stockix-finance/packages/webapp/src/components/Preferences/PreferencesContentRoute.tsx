// @ts-nocheck
import React, { Suspense } from 'react';
import { Route, Switch, Redirect } from 'react-router-dom';
import { getPreferenceRoutes } from '@/routes/preferences';
import { Spinner } from '@blueprintjs/core';
import { Box } from '../Layout';

export default function PreferencesContentRoute() {
  const preferencesRoutes = getPreferenceRoutes();

  return (
    <Switch>
      <Redirect exact from="/preferences" to="/preferences/general" />
      {preferencesRoutes.map((route, index) => {
        const Component = route.component;
        return (
          <Route key={index} path={`${route.path}`} exact={route.exact}>
            <Suspense
              fallback={
                <Box style={{ padding: 20 }}>
                  <Spinner size={20} />
                </Box>
              }
            >
              <Component />
            </Suspense>
          </Route>
        );
      })}
      <Redirect to="/preferences/general" />
    </Switch>
  );
}
