// @ts-nocheck
import React, { lazy } from 'react';
import { FormattedMessage as T } from '@/components';
import { Dialog, DialogSuspense } from '@/components';
import withDialogRedux from '@/components/DialogReduxConnect';
import { compose } from '@/utils';

const ExchangeRateFormContent = lazy(() => import('./ExchangeRateFormContent'));

function ExchangeRateFormDialog({
  dialogName,
  payload = { action: '', exchangeRate: null, currencyCode: '' },
  isOpen,
}) {
  return (
    <Dialog
      name={dialogName}
      title={
        payload.action === 'edit' ? (
          <T id={'edit_exchange_rate'} />
        ) : (
          <T id={'new_exchange_rate'} />
        )
      }
      className={'dialog--exchange-rate-form'}
      isOpen={isOpen}
      autoFocus={true}
      canEscapeKeyClose={true}
      style={{ width: '450px' }}
    >
      <DialogSuspense>
        <ExchangeRateFormContent
          dialogName={dialogName}
          action={payload.action}
          exchangeRate={payload.exchangeRate}
          currencyCode={payload.currencyCode}
          isOpen={isOpen}
        />
      </DialogSuspense>
    </Dialog>
  );
}

export default compose(withDialogRedux())(ExchangeRateFormDialog);
