// @ts-nocheck
import React from 'react';
import axios from 'axios';
import http from '@/services/axios';
import { normalizeApiPath } from '../utils';

export default function useApiRequest() {
  return React.useMemo(
    () => ({
      http,

      get(resource, params) {
        return http.get(`/api/${normalizeApiPath(resource)}`, params);
      },

      post(resource, params, config) {
        return http.post(`/api/${normalizeApiPath(resource)}`, params, config);
      },

      update(resource, slug, params) {
        return http.put(`/api/${normalizeApiPath(resource)}/${slug}`, params);
      },

      put(resource, params) {
        return http.put(`/api/${normalizeApiPath(resource)}`, params);
      },

      patch(resource, params, config) {
        return http.patch(`/api/${normalizeApiPath(resource)}`, params, config);
      },

      delete(resource, params) {
        return http.delete(`/api/${normalizeApiPath(resource)}`, params);
      },
    }),
    [],
  );
}

export function useAuthApiRequest() {
  const httpInstance = React.useMemo(() => axios.create(), []);

  return React.useMemo(
    () => ({
      http: httpInstance,
      get(resource, params) {
        return httpInstance.get(`/api/${normalizeApiPath(resource)}`, params);
      },
      post(resource, params, config) {
        return httpInstance.post(`/api/${normalizeApiPath(resource)}`, params, config);
      },
      update(resource, slug, params) {
        return httpInstance.put(`/api/${normalizeApiPath(resource)}/${slug}`, params);
      },
      put(resource, params) {
        return httpInstance.put(`/api/${normalizeApiPath(resource)}`, params);
      },
      patch(resource, params, config) {
        return httpInstance.patch(`/api/${normalizeApiPath(resource)}`, params, config);
      },
      delete(resource, params) {
        return httpInstance.delete(`/api/${normalizeApiPath(resource)}`, params);
      },
    }),
    [httpInstance],
  );
}
