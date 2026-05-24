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
  isOrganizationReady,
  isOrganizationSetupCompleted,
}) {
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
  withOrganization(({ isOrganizationReady, isOrganizationSetupCompleted }) => ({
    isOrganizationReady,
    isOrganizationSetupCompleted,
  })),
)(EnsureOrganizationIsReady);
