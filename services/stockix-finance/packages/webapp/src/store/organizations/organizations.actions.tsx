// @ts-nocheck
import ApiService from '@/services/ApiService';
import t from '@/store/types';

export const setOrganizations = (organizations) => {
  return {
    type: t.ORGANIZATIONS_LIST_SET,
    payload: {
      organizations,
    },
  };
};

export const fetchOrganizations = () => (dispatch) =>
  new Promise((resolve, reject) => {
    ApiService.get('organization/all')
      .then((response) => {
        dispatch({
          type: t.ORGANIZATIONS_LIST_SET,
          payload: {
            organizations: response.data.organizations,
          },
        });
        resolve(response);
      })
      .catch((error) => {
        reject(error);
      });
  });

export const setOrganizationSetupCompleted =
  (setupCompletedAt) => (dispatch, getState) => {
    const tenantId = getState().authentication.tenantId;

    dispatch({
      type: t.SET_ORGANIZATION_SETUP_COMPLETED,
      payload: {
        tenantId,
        setupCompletedAt: setupCompletedAt ?? new Date().toISOString(),
      },
    });
  };
