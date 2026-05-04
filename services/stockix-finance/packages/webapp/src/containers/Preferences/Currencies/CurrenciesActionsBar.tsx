// @ts-nocheck
import React from 'react';
import { Button, Classes, NavbarDivider, NavbarGroup } from '@blueprintjs/core';
import { DashboardActionsBar, FormattedMessage as T, Icon } from '@/components';
import withDialogActions from '@/containers/Dialog/withDialogActions';
import { compose } from '@/utils';

function CurrenciesActionsBar({ openDialog }) {
  const handleNewCurrency = () => {
    openDialog('currency-form', { action: 'new' });
  };

  const handleNewExchangeRate = () => {
    openDialog('exchangeRate-form', {});
  };

  return (
    <DashboardActionsBar>
      <NavbarGroup>
        <Button
          className={Classes.MINIMAL}
          icon={<Icon icon="plus" />}
          text={<T id={'new_currency'} />}
          onClick={handleNewCurrency}
        />
        <NavbarDivider />
        <Button
          className={Classes.MINIMAL}
          icon={<Icon icon="plus" />}
          text={<T id={'new_exchange_rate'} />}
          onClick={handleNewExchangeRate}
        />
      </NavbarGroup>
    </DashboardActionsBar>
  );
}

export default compose(withDialogActions)(CurrenciesActionsBar);
