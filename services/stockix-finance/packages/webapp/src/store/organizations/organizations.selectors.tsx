// @ts-nocheck
import { createSelector } from '@reduxjs/toolkit';

const organizationSelector = (state, props) => {
  const tenantId = state.organizations.byOrganizationId[props.organizationId];
  return state.organizations.data[tenantId];
};

export const getOrganizationByIdFactory = () =>
  createSelector(organizationSelector, (organization) => organization);

export const isOrganizationSeededFactory = () =>
  createSelector(organizationSelector, (organization) => {
    return !!(organization?.seeded_at ?? organization?.seededAt);
  });

export const isOrganizationBuiltFactory = () =>
  createSelector(organizationSelector, (organization) => {
    return !!(organization?.initialized_at ?? organization?.initializedAt);
  });

export const isOrganizationReadyFactory = () =>
  createSelector(organizationSelector, (organization) => {
    // Nest.js API returns camelCase (isReady); legacy Knex API used snake_case (is_ready).
    return organization?.is_ready ?? organization?.isReady;
  });

export const isOrganizationSubscribedFactory = () =>
  createSelector(organizationSelector, (organization) => {
    return organization?.subscriptions?.length > 0;
  });

export const isOrganizationCongratsFactory = () =>
  createSelector(organizationSelector, (organization) => {
    return !!(
      organization?.setup_completed_at ?? organization?.setupCompletedAt
    );
  });

export const isOrganizationBuildRunningFactory = () =>
  createSelector(organizationSelector, (organization) => {
    return !!(organization?.is_build_running ?? organization?.isBuildRunning);
  });
