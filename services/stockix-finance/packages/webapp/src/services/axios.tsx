// @ts-nocheck
import axios from 'axios';
import { store } from '@/store/createStore';
import { removeCookie } from '@/utils';
import { setGlobalErrors } from '@/store/globalErrors/globalErrors.actions';
import { getAppQueryClient } from '@/services/queryClientHolder';

const http = axios.create();

const TENANT_SETUP_401_TYPES = [
  'TENANT.DATABASE.NOT.INITALIZED',
  'TENANT.DATABASE.NOT.SEED',
  'TENANT.NOT.FOUND',
];

let handlingUnauthorized = false;

function isTenantSetup401(data) {
  const errorTypes = Array.isArray(data?.errors)
    ? data.errors.map((e) => e?.type).filter(Boolean)
    : [];
  return errorTypes.some((type) => TENANT_SETUP_401_TYPES.includes(type));
}

function clearAuthSession() {
  removeCookie('token');
  removeCookie('organization_id');
  removeCookie('tenant_id');
  removeCookie('authenticated_user_id');
  localStorage.clear();
  sessionStorage.clear();
}

function redirectToLogin() {
  if (window.location.pathname === '/auth/login') {
    return;
  }
  if (handlingUnauthorized) {
    return;
  }
  handlingUnauthorized = true;
  getAppQueryClient()?.clear();
  clearAuthSession();
  const returnUrl = encodeURIComponent(
    `${window.location.pathname}${window.location.search}`,
  );
  window.location.href = `/auth/login?redirect=${returnUrl}`;
}

function setRequestHeader(request, key, value) {
  const headers = request.headers ?? {};
  if (typeof headers.set === 'function') {
    headers.set(key, value);
  } else {
    headers[key] = value;
  }
  request.headers = headers;
}

http.interceptors.request.use((request) => {
  const state = store.getState();
  const { token, organization } = state.authentication;
  const locale = 'en';

  if (token) {
    setRequestHeader(request, 'x-access-token', token);
    setRequestHeader(request, 'Authorization', `Bearer ${token}`);
  }
  if (organization) {
    setRequestHeader(request, 'organization-id', organization);
  }
  if (locale) {
    setRequestHeader(request, 'Accept-Language', locale);
  }
  request.headers.common['Accept-Language'] = 'ar';

  return request;
}, (error) => {
  return Promise.reject(error);
});

http.interceptors.response.use((response) => response, (error) => {
  if (error.response) {
    const { status, data } = error.response;

    if (status >= 500) {
      store.dispatch(setGlobalErrors({ something_wrong: true }));
    }

    if (status === 401) {
      const { token } = store.getState().authentication;
      if (!token || isTenantSetup401(data)) {
        return Promise.reject(error);
      }
      redirectToLogin();
    }
    if (status === 403) {
      store.dispatch(setGlobalErrors({ access_denied: { message: data.message } }));
    }
    if (status === 429) {
      store.dispatch(setGlobalErrors({ too_many_requests: true }));
    }
    if (status === 400 && Array.isArray(data?.errors)) {
      const lockedError = data.errors.find(
        (err) => err.type === 'TRANSACTIONS_DATE_LOCKED',
      );
      if (lockedError) {
        store.dispatch(setGlobalErrors({ transactionsLocked: { ...lockedError.payload } }));
      }
      if (
        data.errors.find(
          (e) => e.type === 'ORGANIZATION.SUBSCRIPTION.INACTIVE',
        )
      ) {
        store.dispatch(setGlobalErrors({ subscriptionInactive: true }));
      }
      if (data.errors.find((e) => e.type === 'USER_INACTIVE')) {
        store.dispatch(setGlobalErrors({ userInactive: true }));
        clearAuthSession();
        window.location.reload();
      }
    }
  }
  return Promise.reject(error);
});

export default http;
