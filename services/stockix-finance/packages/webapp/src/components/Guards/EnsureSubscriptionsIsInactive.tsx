// @ts-nocheck
import React from 'react';
import { includes } from 'lodash';
import { Redirect } from 'react-router-dom';

import { compose } from '@/utils';
import { withSubscriptions } from '@/containers/Subscriptions/withSubscriptionss';
import { useDashboardMeta } from '@/hooks/query';

function EnsureSubscriptionsIsInactive({
  children,
  redirectTo = '/billing',
  routePath,
  exclude,
  isSubscriptionsInactive,
  billingEnabled = false,
}) {
  if (!billingEnabled) {
    return children;
  }

  return !isSubscriptionsInactive || includes(exclude, routePath) ? (
    children
  ) : (
    <Redirect to={{ pathname: redirectTo }} />
  );
}

function EnsureSubscriptionsIsInactiveWithBilling(props) {
  const { data } = useDashboardMeta({ enabled: true });
  const billingEnabled =
    data?.billingEnabled === true || data?.billing_enabled === true;

  return (
    <EnsureSubscriptionsIsInactive
      {...props}
      billingEnabled={billingEnabled}
    />
  );
}

export default compose(
  withSubscriptions(
    ({ isSubscriptionsInactive }) => ({ isSubscriptionsInactive }),
    'main',
  ),
)(EnsureSubscriptionsIsInactiveWithBilling);
