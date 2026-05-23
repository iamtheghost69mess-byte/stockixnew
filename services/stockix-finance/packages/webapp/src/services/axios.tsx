// @ts-nocheck
import axios from 'axios';
import { store } from '@/store/createStore';
import { removeCookie } from '@/utils';
import { setGlobalErrors } from '@/store/globalErrors/globalErrors.actions';
const http = axios.create();


http.interceptors.request.use((request) => {
  const state = store.getState();
  const { token, organizationId, locale } = state.authentication;

  if (token) {
    request.headers.common['x-access-token'] = token;
    request.headers.common['Authorization'] = `Bearer ${token}`;
  }
  if (organizationId) {
    request.headers.common['organization-id'] = organizationId;
  }
  if (locale) {
    request.headers.common['Accept-Language'] = locale;
  }

  return request;
}, (error) => {
  return Promise.reject(error);
});

http.interceptors.response.use((response) => response, (error) => {
  if (error.response) {
    const { status } = error.response;

    if (status >= 500) {
      store.dispatch(setGlobalErrors({ something_wrong: true }));
    }

    if (status === 401) {
      const { token } = store.getState().authentication;
      if (!token) {
        return Promise.reject(error);
      }

      removeCookie('token');
      removeCookie('organization_id');
      removeCookie('tenant_id');
      removeCookie('authenticated_user_id');

      // Clear all local storage and session caches to prevent state re-hydration loops
      localStorage.clear();
      sessionStorage.clear();

      window.location.href = '/auth/login';
    }
  }
  return Promise.reject(error);
});

export default http;