// @ts-nocheck
import { lazy, Suspense } from 'react';
import { Router, Switch, Route } from 'react-router';
import { createBrowserHistory } from 'history';
import { QueryClientProvider, QueryClient } from 'react-query';
import { ReactQueryDevtools } from 'react-query/devtools';

import '@/style/App.scss';
import 'moment/locale/ar-ly';
import 'moment/locale/es-us';

import AppIntlLoader from './AppIntlLoader';
import { EnsureAuthenticated } from '@/components/Guards/EnsureAuthenticated';
import GlobalErrors from '@/containers/GlobalErrors/GlobalErrors';
import SuspendedOverlay from '@/components/License/SuspendedOverlay';

import { SplashScreen, DashboardThemeProvider } from '../components';
import { queryConfig } from '../hooks/query/base';
import { setAppQueryClient } from '@/services/queryClientHolder';
import { EnsureUserEmailNotVerified } from './Guards/EnsureUserEmailNotVerified';

const DashboardPrivatePages = lazy(
  () => import('@/components/Dashboard/PrivatePages'),
);
const AuthenticationPage = lazy(
  () => import('@/containers/Authentication/AuthenticationPage'),
);
const EmailConfirmation = lazy(
  () => import('@/containers/Authentication/EmailConfirmation'),
);
const RegisterVerify = lazy(
  () => import('@/containers/Authentication/RegisterVerify'),
);
const OneClickDemoPage = lazy(
  () => import('@/containers/OneClickDemo/OneClickDemoPage'),
);
const PaymentPortalPage = lazy(
  () => import('@/containers/PaymentPortal/PaymentPortalPage'),
);
const ChangePasswordPage = lazy(
  () => import('@/containers/Authentication/ChangePasswordPage'),
);

/**
 * App inner.
 */
function AppInsider({ history }) {
  return (
    <div className="App">
      <DashboardThemeProvider>
        <Suspense fallback={'Loading...'}>
          <Router history={history}>
            <Switch>
              <Route path={'/one_click_demo'} children={<OneClickDemoPage />} />
              <Route path={'/auth/register/verify'}>
                <EnsureAuthenticated>
                  <EnsureUserEmailNotVerified>
                    <RegisterVerify />
                  </EnsureUserEmailNotVerified>
                </EnsureAuthenticated>
              </Route>

              <Route
                path={'/auth/email_confirmation'}
                children={<EmailConfirmation />}
              />
              <Route
                path={'/auth/change-password'}
                children={<ChangePasswordPage />}
              />
              <Route path={'/auth'} children={<AuthenticationPage />} />
              <Route
                path={'/payment/:linkId'}
                children={<PaymentPortalPage />}
              />
              <Route path={'/'} children={<DashboardPrivatePages />} />
            </Switch>
          </Router>
        </Suspense>

        <GlobalErrors />
        <SuspendedOverlay />
      </DashboardThemeProvider>
    </div>
  );
}

// Browser history.
const history = createBrowserHistory();

// Query client.
const queryClient = new QueryClient(queryConfig);
setAppQueryClient(queryClient);

/**
 * Core application.
 */
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SplashScreen />

      <AppIntlLoader>
        <AppInsider history={history} />
      </AppIntlLoader>

      <ReactQueryDevtools initialIsOpen />
    </QueryClientProvider>
  );
}
