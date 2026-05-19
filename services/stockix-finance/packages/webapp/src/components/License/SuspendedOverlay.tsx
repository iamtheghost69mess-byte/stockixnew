// @ts-nocheck
import React from 'react';
import { useDashboardMeta } from '@/hooks/query';

export default function SuspendedOverlay() {
  const { data } = useDashboardMeta({ enabled: true });
  const status = data?.licenseStatus ?? data?.license_status;

  if (status !== 'suspended') {
    return null;
  }

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
        <h2 style={{ marginBottom: '1rem' }}>Account suspended</h2>
        <p>
          Your account has been suspended. Contact your provider to restore
          access.
        </p>
      </div>
    </div>
  );
}
