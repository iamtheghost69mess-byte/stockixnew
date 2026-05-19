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
    return !!organization?.seeded_at;
  });

export const isOrganizationBuiltFactory = () =>
  createSelector(organizationSelector, (organization) => {
    return !!organization?.initialized_at;
  });

export const isOrganizationReadyFactory = () =>
  createSelector(organizationSelector, (organization) => {
    return organization?.is_ready;
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
    return !!organization?.is_build_running;
  });
