// @ts-nocheck
import React, { lazy } from 'react';
import { Dialog, DialogSuspense, FormattedMessage as T } from '@/components';
import withDialogRedux from '@/components/DialogReduxConnect';
import { compose } from '@/utils';

const ExchangeRateFormDialogContent = lazy(
  () => import('./ExchangeRateFormDialogContent'),
);

/**
 * Exchange rate form dialog.
 */
function ExchangeRateFormDialog({
  dialogName,
  payload = { action: '', id: null, exchangeRate: '', currencyCode: '' },
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
      className={'dialog--exchangeRate-form'}
      isOpen={isOpen}
      autoFocus={true}
      canEscapeKeyClose={true}
    >
      <DialogSuspense>
        <ExchangeRateFormDialogContent
          dialogName={dialogName}
          action={payload.action}
          exchangeRateId={payload.exchangeRate}
          currencyCode={payload.currencyCode}
        />
      </DialogSuspense>
    </Dialog>
  );
}

export default compose(withDialogRedux())(ExchangeRateFormDialog);
