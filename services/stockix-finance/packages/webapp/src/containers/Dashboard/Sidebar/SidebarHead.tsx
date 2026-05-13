// @ts-nocheck
import { Button, MenuItem, Popover, Menu, Position } from '@blueprintjs/core';

import { Icon } from '@/components';

import { withCurrentOrganization } from '@/containers/Organization/withCurrentOrganization';
import { useAuthenticatedAccount } from '@/hooks/query';
import { useStockixOrgs } from '@/hooks/query/useStockixOrgs';
import { compose, firstLettersArgs } from '@/utils';

// Popover modifiers.
const POPOVER_MODIFIERS = {
  offset: { offset: '28, 8' },
};

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
  const currentHost =
    typeof window !== 'undefined' ? window.location.hostname : '';

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
                    const isCurrent = currentHost === org.subdomain;
                    return (
                      <MenuItem
                        key={org.id}
                        text={org.name}
                        icon={isCurrent ? 'tick' : 'office'}
                        active={isCurrent}
                        onClick={() => {
                          if (!isCurrent) {
                            const u = org.publicUrl?.trim();
                            if (u) {
                              window.location.href = u;
                              return;
                            }
                            const proto = org.subdomain.includes('.localhost')
                              ? 'http:'
                              : window.location.protocol;
                            window.location.href = `${proto}//${org.subdomain}`;
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
