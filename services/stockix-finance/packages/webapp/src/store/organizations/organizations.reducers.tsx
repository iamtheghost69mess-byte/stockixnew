// @ts-nocheck
import { createReducer } from '@reduxjs/toolkit';
import { omit } from 'lodash';
import t from '@/store/types';

const initialState = {
  data: {},
  byOrganizationId: {},
};

const reducer = createReducer(initialState, {

  [t.ORGANIZATIONS_LIST_SET]: (state, action) => {
    const { organizations } = action.payload;
    const _data = {};
    const _dataByOrganizationId = {};

    organizations.forEach((organization) => {
      _data[organization.id] = {
        ...state.data[organization.id],
        ...organization.metadata,
        ...omit(organization, ['metadata']),
      };
      _dataByOrganizationId[organization.organization_id] = organization.id;
    });
    state.data = _data;
    state.byOrganizationId = _dataByOrganizationId;
  },

  [t.SET_ORGANIZATION_SETUP_COMPLETED]: (state, action) => {
    const { tenantId, setupCompletedAt } = action.payload;

    state.data[tenantId] = {
      ...(state.data[tenantId] || {}),
      setup_completed_at: setupCompletedAt,
    };
  },
})

export default reducer;