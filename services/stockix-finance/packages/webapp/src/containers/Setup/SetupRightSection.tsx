// @ts-nocheck
import React from 'react';
import { Redirect } from 'react-router-dom';
import { x } from '@xstyled/emotion';

import SetupWizardContent from './SetupWizardContent';

import { withOrganization } from '@/containers/Organization/withOrganization';
import { withCurrentOrganization } from '@/containers/Organization/withCurrentOrganization';
import { withSetupWizard } from '@/store/organizations/withSetupWizard';
import { withSubscriptions } from '../Subscriptions/withSubscriptions';

import { compose } from '@/utils';

/**
 * Wizard setup right section.
 */
function SetupRightSection({
  // #withOrganization
  isOrganizationReady,
  isOrganizationInitialized,
  isOrganizationSeeded,
  isOrganizationSetupCompleted,

  // #withSetupWizard
  setupStepId,
  setupStepIndex,

  // #withSubscriptions
  isSubscriptionActive,
}) {
  if (isOrganizationReady && !isOrganizationSetupCompleted) {
    return <Redirect to="/setup/complete" />;
  }

  return (
    <x.section w="100%" overflow="auto">
      <SetupWizardContent stepId={setupStepId} stepIndex={setupStepIndex} />
    </x.section>
  );
}

export default compose(
  withCurrentOrganization(({ organizationTenantId }) => ({
    organizationId: organizationTenantId,
  })),
  withOrganization(
    ({
      organization,
      isOrganizationReady,
      isOrganizationSeeded,
      isOrganizationSetupCompleted,
      isOrganizationBuildRunning,
    }) => ({
      organization,
      isOrganizationReady,
      isOrganizationSeeded,
      isOrganizationSetupCompleted,
      isOrganizationBuildRunning,
    }),
  ),
  withSubscriptions(
    ({ isSubscriptionActive }) => ({
      isSubscriptionActive,
    }),
    'main',
  ),
  withSetupWizard(({ setupStepId, setupStepIndex }) => ({
    setupStepId,
    setupStepIndex,
  })),
)(SetupRightSection);
