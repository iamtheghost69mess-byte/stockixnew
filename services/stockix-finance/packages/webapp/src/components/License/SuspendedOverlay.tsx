// @ts-nocheck
import React from 'react';
import { useDashboardMeta } from '@/hooks/query';
import { useAuthOrganizationId, useIsAuthenticated } from '@/hooks/state';

export default function SuspendedOverlay() {
  const isAuthenticated = useIsAuthenticated();
  const organizationId = useAuthOrganizationId();
  const { data } = useDashboardMeta({
    enabled: isAuthenticated && !!organizationId,
  });
  const status = data?.licenseStatus ?? data?.license_status;

  if (status !== 'suspended' && status !== 'revoked') {
    return null;
  }

  const isRevoked = status === 'revoked';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(180, 20, 20, 0.95)',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        textAlign: 'center',
      }}
    >
      <div>
        <h2 style={{ marginBottom: '1rem' }}>
          {isRevoked ? 'License revoked' : 'Account suspended'}
        </h2>
        <p>
          {isRevoked
            ? 'Your license has been permanently revoked. Please contact your provider.'
            : 'Your account has been suspended. Contact your provider to restore access.'}
        </p>
      </div>
    </div>
  );
}
