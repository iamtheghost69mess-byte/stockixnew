// @ts-nocheck
import React from 'react';
import classNames from 'classnames';

import '@/style/components/BigcapitalLoading.scss';
import { useIsDarkMode } from '@/hooks/useDarkMode';
import { StockixLogo } from '@/components/Icons/StockixLogo';

/**
 * Stockix logo loading splash.
 */
export default function BigcapitalLoading({ className }) {
  const isDarkmode = useIsDarkMode();

  return (
    <div className={classNames('bigcapital-loading', className)}>
      <div class="center">
        <StockixLogo
          height={37}
          width={214}
          color={isDarkmode ? '#fff' : undefined}
          className="bigcapital-logo"
        />
      </div>
    </div>
  );
}