import { useMutation } from 'react-query';
import useApiRequest from '../useRequest';
import { setCookie } from '../../utils';

interface SwitchTenantResponse {
  access_token: string;
  organization_id: string;
  tenant_id: number;
  user_id: number;
}

export function useSwitchTenant() {
  const apiRequest = useApiRequest();

  return useMutation<SwitchTenantResponse, Error, string>(
    async (organizationId: string) => {
      const res = await apiRequest.post(
        'auth/switch-tenant',
        { organization_id: organizationId },
        undefined,
      );
      return res.data as SwitchTenantResponse;
    },
    {
      onSuccess: (data: SwitchTenantResponse) => {
        setCookie('token', data.access_token);
        setCookie('authenticated_user_id', String(data.user_id));
        setCookie('organization_id', data.organization_id);
        setCookie('tenant_id', String(data.tenant_id));

        // Full page reload — clears stale Redux and re-reads cookies into initialState.
        window.location.replace('/');
      },
    },
  );
}

// cache-bust: 1778948709
