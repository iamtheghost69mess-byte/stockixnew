// @ts-nocheck
import React from 'react';
import { connect } from 'react-redux';
import { Redirect } from 'react-router-dom';
import { compose } from '@/utils';

import { withAuthentication } from '@/containers/Authentication/withAuthentication';
import { withOrganization } from '@/containers/Organization/withOrganization';

function EnsureOrganizationIsReady({
  // #ownProps
  children,
  redirectTo = '/setup',
  setupIncompleteRedirectTo = '/setup/complete',
  requireSetupCompleted = true,

  // #withOrganizationByOrgId
  organization,
  isOrganizationReady,
  isOrganizationSetupCompleted,
}) {
  // Org hasn't been fetched yet (selector returned undefined) — wait without redirecting.
  // This prevents a redirect loop caused by the guard firing before boot queries complete.
  if (organization === undefined || organization === null) {
    return null;
  }

  if (!isOrganizationReady) {
    return <Redirect to={{ pathname: redirectTo }} />;
  }

  if (requireSetupCompleted && !isOrganizationSetupCompleted) {
    return <Redirect to={{ pathname: setupIncompleteRedirectTo }} />;
  }

  return children;
}

export default compose(
  withAuthentication(),
  connect((state, props) => ({
    organizationId: props.currentOrganizationId,
  })),
  withOrganization(({ organization, isOrganizationReady, isOrganizationSetupCompleted }) => ({
    organization,
    isOrganizationReady,
    isOrganizationSetupCompleted,
  })),
)(EnsureOrganizationIsReady);
