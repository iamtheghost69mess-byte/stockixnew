// @ts-nocheck
import axios from 'axios';
import { store } from '@/store/createStore';
import { removeCookie } from '@/utils';
import { setGlobalErrors } from '@/store/globalErrors/globalErrors.actions';
const http = axios.create();


http.interceptors.request.use((request) => {
  const state = store.getState();
  const { token, organization } = state.authentication;
  const locale = 'en';

  if (token) {
    request.headers.common['x-access-token'] = token;
  }
  if (organization) {
    request.headers.common['organization-id'] = organization;
  }
  if (locale) {
    request.headers.common['Accept-Language'] = locale;
  }
  request.headers.common['Accept-Language'] = 'ar';

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