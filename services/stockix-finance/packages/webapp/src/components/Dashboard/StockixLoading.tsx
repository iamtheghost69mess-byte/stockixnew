// @ts-nocheck
import React from 'react';
import classNames from 'classnames';
// import { Icon } from '@/components'; // uncomment with Icon in JSX below

import '@/style/components/StockixLoading.scss';

/**
 * Initial-load splash (shows briefly on refresh until i18n is ready).
 * White-label: vendor logo Icon commented out — uncomment when `stockix` icon is yours.
 */
export default function StockixLoading({ className }) {
  return (
    <div className={classNames('stockix-loading', className)}>
      <div class="center">
        {/*
          <Icon icon="stockix" height={37} width={228} />
        */}
      </div>
    </div>
  );
}
