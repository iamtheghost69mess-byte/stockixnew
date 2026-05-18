// @ts-nocheck
import { Button, MenuItem, Popover, Menu, Position } from '@blueprintjs/core';

import { Icon } from '@/components';

import { withCurrentOrganization } from '@/containers/Organization/withCurrentOrganization';
import { useAuthenticatedAccount } from '@/hooks/query';
import { useStockixOrgs } from '@/hooks/query/useStockixOrgs';
import { useSwitchTenant } from '@/hooks/query/useSwitchTenant';
import { useAuthOrganizationId } from '@/hooks/state';
import { compose, firstLettersArgs } from '@/utils';

// Popover modifiers.
const POPOVER_MODIFIERS = {
  offset: { offset: '28, 8' },
};

function getTargetHost(org) {
  if (org.subdomain) return org.subdomain;
  const url = org.publicUrl?.trim();
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * Sideabr head.
 */
function SidebarHeadJSX({
  // #withCurrentOrganization
  organization,
}) {
  // Retrieve authenticated user information.
  const { data: user } = useAuthenticatedAccount();
  const { data: stockixOrgs = [] } = useStockixOrgs();
  const { mutate: switchTenant, isLoading: isSwitching } = useSwitchTenant();
  const currentOrganizationId = useAuthOrganizationId();
  const currentHost =
    typeof window !== 'undefined' ? window.location.hostname : '';

  const handleOrgSelect = (org) => {
    const targetHost = getTargetHost(org);
    const isSameHost = !targetHost || currentHost === targetHost;

    if (isSameHost) {
      switchTenant(org.organizationId);
      return;
    }

    const u = org.publicUrl?.trim();
    if (u) {
      window.location.href = u;
      return;
    }
    const proto = org.subdomain?.includes('.localhost')
      ? 'http:'
      : window.location.protocol;
    window.location.href = `${proto}//${org.subdomain}`;
  };

  return (
    <div className="sidebar__head">
      <div className="sidebar__head-organization">
        <Popover
          modifiers={POPOVER_MODIFIERS}
          boundary={'window'}
          content={
            <Menu className={'menu--dashboard-organization'}>
              {stockixOrgs.length >= 1 ? (
                <>
                  {stockixOrgs.map((org) => {
                    const isCurrent =
                      org.organizationId === currentOrganizationId ||
                      (org.subdomain && currentHost === org.subdomain);
                    return (
                      <MenuItem
                        key={org.organizationId || org.id}
                        text={org.name}
                        icon={isCurrent ? 'tick' : 'office'}
                        active={isCurrent}
                        disabled={isSwitching}
                        onClick={() => {
                          if (!isCurrent) {
                            handleOrgSelect(org);
                          }
                        }}
                      />
                    );
                  })}
                </>
              ) : (
                <div class="org-item">
                  <div class="org-item__logo">
                    {firstLettersArgs(...(organization.name || '').split(' '))}{' '}
                  </div>
                  <div class="org-item__name">{organization.name}</div>
                </div>
              )}
            </Menu>
          }
          position={Position.BOTTOM}
          minimal={true}
        >
          <Button
            className="title"
            rightIcon={<Icon icon={'caret-down-16'} size={16} />}
            disabled={isSwitching}
          >
            {organization.name}
          </Button>
        </Popover>
        <span class="subtitle">{user.full_name}</span>
      </div>

      <div className="sidebar__head-logo">
        <Icon
          icon={'mini-bigcapital'}
          width={28}
          height={28}
          className="bigcapital--alt"
        />
      </div>
    </div>
  );
}

export const SidebarHead = compose(
  withCurrentOrganization(({ organization }) => ({ organization })),
)(SidebarHeadJSX);
