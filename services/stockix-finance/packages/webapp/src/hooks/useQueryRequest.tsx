// @ts-nocheck
import { useQuery } from 'react-query';
import { castArray, defaultTo } from 'lodash';
import { useAuthOrganizationId, useAuthToken } from './state';
import useApiRequest from './useRequest';
import { normalizeApiPath } from '../utils';
import { useRef } from 'react';

/**
 * Query for tenant requests.
 */
export function useQueryTenant(query, callback, props) {
  const organizationId = useAuthOrganizationId();

  return useQuery([...castArray(query), organizationId], callback, props);
}

export function useRequestQuery(query, axios, props) {
  const apiRequest = useApiRequest();
  const organizationId = useAuthOrganizationId();
  const token = useAuthToken();
  const requiresAuth = props?.requiresAuth !== false;

  const states = useQuery(
    [...castArray(query), organizationId, token],
    () =>
      apiRequest.http({
        ...axios,
        url: `/api/${normalizeApiPath(axios.url)}`,
      }),
    {
      enabled:
        (props?.enabled ?? true)
        && (!requiresAuth || (!!token && !!organizationId)),
      ...props,
    },
  );
  // Momerize the default data.
  const defaultData = useRef(props.defaultData || undefined);

  return {
    ...states,
    data: defaultTo(states.data, defaultData.current),
  };
}
