// @ts-nocheck
import React from 'react';
import classNames from 'classnames';
// import { Icon } from '@/components'; // uncomment with Icon in JSX below

import '@/style/components/BigcapitalLoading.scss';

/**
 * Initial-load splash (shows briefly on refresh until i18n is ready).
 * White-label: vendor logo Icon commented out — uncomment when `bigcapital` icon is yours.
 */
export default function BigcapitalLoading({ className }) {
  return (
    <div className={classNames('bigcapital-loading', className)}>
      <div class="center">
        {/*
          <Icon icon="bigcapital" height={37} width={228} />
        */}
      </div>
    </div>
  );
}
