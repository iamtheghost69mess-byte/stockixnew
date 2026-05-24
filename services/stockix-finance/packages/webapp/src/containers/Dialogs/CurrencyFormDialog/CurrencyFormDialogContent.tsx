// @ts-nocheck
import React from 'react';
import { CurrencyFormProvider } from './CurrencyFormProvider';

import CurrencyForm from './CurrencyForm';
import '@/style/pages/Currency/CurrencyFormDialog.scss';

function CurrencyFormDialogContent({
  // #ownProp
  action,
  currencyCode,
  dialogName,
  isOpen,
}) {
  // CLOSE_DIALOG only flips isOpen; payload can stay stale while Blueprint keeps
  // children mounted. Only treat as edit when the dialog is actually open and we
  // have a real persisted currency row (id), not merely a leftover action flag.
  const isEditMode =
    !!isOpen &&
    action === 'edit' &&
    currencyCode != null &&
    typeof currencyCode === 'object' &&
    currencyCode.id != null;

  return (
    <CurrencyFormProvider
      isEditMode={isEditMode}
      currency={currencyCode}
      dialogName={dialogName}
    >
      <div>
        <CurrencyForm />
      </div>
    </CurrencyFormProvider>
  );
}

export default CurrencyFormDialogContent;
