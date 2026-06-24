import React, { useEffect } from 'react';
import intl from 'react-intl-universal';
import classNames from 'classnames';
import styled from 'styled-components';
import { Intent, Tag, Spinner, NonIdealState } from '@blueprintjs/core';
import { Card } from '@/components';
import { CLASSES } from '@/constants/classes';
import { withDashboardActions } from '@/containers/Dashboard/withDashboardActions';
import { useDashboardMeta } from '@/hooks/query';
import { useIsAuthenticated, useAuthOrganizationId } from '@/hooks/state';
import { compose } from '@/utils';

/** Status → Blueprint intent mapping. */
const STATUS_INTENT: Record<string, Intent> = {
  active: 'success',
  grace: 'warning',
  expired: 'danger',
  suspended: 'danger',
  revoked: 'danger',
};

/** Status → human label. */
const STATUS_LABEL: Record<string, string> = {
  active: 'Active',
  grace: 'Grace Period',
  expired: 'Expired',
  suspended: 'Suspended',
  revoked: 'Revoked',
};

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span style={{ color: '#8a9ba8' }}>—</span>;
  return (
    <Tag intent={STATUS_INTENT[status] ?? 'none'} minimal>
      {STATUS_LABEL[status] ?? status}
    </Tag>
  );
}

function DateField({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <InfoRow>
      <InfoLabel>{label}</InfoLabel>
      <InfoValue>{new Date(value).toLocaleDateString()}</InfoValue>
    </InfoRow>
  );
}

function PreferencesLicense({ changePreferencesPageTitle }: { changePreferencesPageTitle: (title: string) => void }) {
  useEffect(() => {
    changePreferencesPageTitle('Plan & License');
  }, [changePreferencesPageTitle]);

  const isAuthenticated = useIsAuthenticated();
  const organizationId = useAuthOrganizationId();
  const { data, isLoading } = useDashboardMeta({
    enabled: isAuthenticated && !!organizationId,
  });

  if (isLoading) {
    return (
      <div className={classNames(CLASSES.PREFERENCES_PAGE_INSIDE_CONTENT)}>
        <LicenseCard>
          <Spinner size={24} />
        </LicenseCard>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={classNames(CLASSES.PREFERENCES_PAGE_INSIDE_CONTENT)}>
        <LicenseCard>
          <NonIdealState icon="error" title="Could not load license data." />
        </LicenseCard>
      </div>
    );
  }

  const {
    license_status: licenseStatus,
    license_expires_at: licenseExpiresAt,
    license_grace_period_ends_at: licenseGracePeriodEndsAt,
    plan_slug: planSlug,
    license_key: licenseKey,
    is_perpetual: isPerpetual,
  } = data;

  return (
    <div className={classNames(CLASSES.PREFERENCES_PAGE_INSIDE_CONTENT)}>
      <LicenseCard>
        <SectionTitle>Plan & License</SectionTitle>
        <InfoTable>
          <InfoRow>
            <InfoLabel>Plan</InfoLabel>
            <InfoValue style={{ color: planSlug ? '#1c2127' : '#8a9ba8' }}>
              {planSlug ?? '—'}
            </InfoValue>
          </InfoRow>

          <InfoRow>
            <InfoLabel>License Status</InfoLabel>
            <InfoValue>
              <StatusBadge status={licenseStatus} />
              {isPerpetual && (
                <Tag minimal style={{ marginLeft: 6 }}>Perpetual</Tag>
              )}
            </InfoValue>
          </InfoRow>

          {licenseKey && (
            <InfoRow>
              <InfoLabel>License Key</InfoLabel>
              <InfoValue>
                <LicenseKeyCode>{licenseKey}</LicenseKeyCode>
              </InfoValue>
            </InfoRow>
          )}

          {!isPerpetual && (
            <DateField label="Expires On" value={licenseExpiresAt} />
          )}

          {licenseStatus === 'grace' && (
            <DateField label="Grace Period Ends" value={licenseGracePeriodEndsAt} />
          )}
        </InfoTable>

        <ReadOnlyNote>
          License information is managed by Stockix and cannot be modified here.
        </ReadOnlyNote>
      </LicenseCard>
    </div>
  );
}

const LicenseCard = styled(Card)`
  padding: 24px 30px;
`;

const SectionTitle = styled.h3`
  margin: 0 0 20px;
  font-size: 15px;
  font-weight: 600;
`;

const InfoTable = styled.div`
  display: flex;
  flex-direction: column;
  gap: 14px;
`;

const InfoRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const InfoLabel = styled.span`
  width: 160px;
  font-size: 13px;
  color: #738091;
  flex-shrink: 0;
`;

const InfoValue = styled.span`
  font-size: 13px;
  color: #1c2127;
  display: flex;
  align-items: center;
`;

const LicenseKeyCode = styled.code`
  font-family: monospace;
  font-size: 12px;
  background: #f5f8fa;
  border: 1px solid #e1e8ed;
  padding: 2px 8px;
  border-radius: 3px;
`;

const ReadOnlyNote = styled.p`
  margin: 20px 0 0;
  font-size: 12px;
  color: #8a9ba8;
  border-top: 1px solid #ebf1f5;
  padding-top: 14px;
`;

export default compose(withDashboardActions)(PreferencesLicense);
