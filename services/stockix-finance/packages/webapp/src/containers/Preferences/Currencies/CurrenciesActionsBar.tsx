// @ts-nocheck
import React from 'react';
import { Button, Classes } from '@blueprintjs/core';
import { DashboardActionsBar, FormattedMessage as T, Icon } from '@/components';
import withDialogActions from '@/containers/Dialog/withDialogActions';
import { compose } from '@/utils';

function CurrenciesActionsBar({ openDialog }) {
  const handleNewCurrency = () => {
    openDialog('currency-form', {});
  };

  const handleNewExchangeRate = () => {
    openDialog('exchangeRate-form', {});
  };

  return (
    <DashboardActionsBar>
      <Button
        className={Classes.MINIMAL}
        icon={<Icon icon="plus" />}
        text={<T id={'new_currency'} />}
        onClick={handleNewCurrency}
      />
      <Button
        className={Classes.MINIMAL}
        icon={<Icon icon="plus" />}
        text={<T id={'new_exchange_rate'} />}
        onClick={handleNewExchangeRate}
      />
    </DashboardActionsBar>
  );
}

export default compose(withDialogActions)(CurrenciesActionsBar);
