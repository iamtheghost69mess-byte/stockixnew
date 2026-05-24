// @ts-nocheck
import React from 'react';
import { Button, Tooltip } from '@blueprintjs/core';
import { useLicenseWriteAllowed } from '@/hooks/useLicenseWriteAllowed';

export function LicenseGatedButton({ disabled, title, ...buttonProps }) {
  const writeAllowed = useLicenseWriteAllowed();
  const isDisabled = disabled || !writeAllowed;

  const button = (
    <Button {...buttonProps} disabled={isDisabled} title={writeAllowed ? title : undefined} />
  );

  if (writeAllowed) {
    return button;
  }

  return (
    <Tooltip content="Upgrade your plan to continue editing">
      <span style={{ display: 'inline-block' }}>{button}</span>
    </Tooltip>
  );
}
