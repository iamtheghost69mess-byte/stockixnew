// @ts-nocheck
import React from 'react';
import { Button, Intent } from '@blueprintjs/core';
import { x } from '@xstyled/emotion';
import { css } from '@emotion/css';
import { useHistory } from 'react-router-dom';
import { useIsDarkMode } from '@/hooks/useDarkMode';

import WorkflowIcon from './WorkflowIcon';
import { FormattedMessage as T } from '@/components';

import { compose } from '@/utils';

/**
 * Setup congrats page.
 */
function SetupCongratsPage() {
  const [isNavigating, setIsNavigating] = React.useState(false);
  const isDarkMode = useIsDarkMode();
  const history = useHistory();

  const handleBtnClick = () => {
    setIsNavigating(true);
    history.push('/setup/complete');
  };

  return (
    <x.div
      w={'500px'}
      mx="auto"
      textAlign="center"
      pt={'80px'}
    >
      <x.div>
        <WorkflowIcon width="280" height="330" />
      </x.div>

      <x.div mt={30}>
        <x.h2
          color={isDarkMode ? 'rgba(255, 255, 255, 0.85)' : '#2d2b43'}
          mb={'12px'}
        >
          <T id={'setup.congrats.title'} />
        </x.h2>

        <x.p
          fontSize={'16px'}
          opacity={0.85}
          mb={'14px'}
          color={isDarkMode ? 'rgba(255, 255, 255, 0.7)' : undefined}
        >
          <T id={'setup.congrats.description'} />
        </x.p>

        <x.div
          className={css`
            .bp4-button {
              height: 38px;
              padding-left: 25px;
              padding-right: 25px;
              font-size: 15px;
              margin-top: 12px;
            }
          `}
        >
          <Button
            intent={Intent.PRIMARY}
            type="submit"
            loading={isNavigating}
            onClick={handleBtnClick}
          >
            <T id={'setup.congrats.go_to_dashboard'} />
          </Button>
        </x.div>
      </x.div>
    </x.div>
  );
}

export default SetupCongratsPage;
