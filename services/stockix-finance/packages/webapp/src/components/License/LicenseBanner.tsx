// @ts-nocheck
import React from 'react';
import { useDashboardMeta } from '@/hooks/query';

export default function LicenseBanner() {
  const { data } = useDashboardMeta({ enabled: true });
  const status = data?.licenseStatus ?? data?.license_status;

  if (status !== 'grace') {
    return null;
  }

  const expiresAt = data?.licenseExpiresAt ?? data?.license_expires_at;
  const graceEndsAt =
    data?.licenseGracePeriodEndsAt ?? data?.license_grace_period_ends_at;

  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 1000,
        background: '#f5c518',
        color: '#1a1a1a',
        padding: '0.75rem 1rem',
        textAlign: 'center',
        fontSize: '14px',
      }}
    >
      Your license expired on{' '}
      {expiresAt ? new Date(expiresAt).toLocaleDateString() : '—'}. You have until{' '}
      {graceEndsAt ? new Date(graceEndsAt).toLocaleDateString() : '—'} to renew
      before losing edit access.
    </div>
  );
}
