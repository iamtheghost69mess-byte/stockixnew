// @ts-nocheck
import React, { useEffect } from 'react';
import intl from 'react-intl-universal';

import { CurrenciesProvider } from './CurrenciesProvider';
import CurrenciesActionsBar from './CurrenciesActionsBar';
import CurrenciesDataTable from './CurrenciesDataTable';

import { withDashboardActions } from '@/containers/Dashboard/withDashboardActions';

import { compose } from '@/utils';

function CurrenciesList({
  // #withDashboardActions
  changePreferencesPageTitle,
}) {
  useEffect(() => {
    changePreferencesPageTitle(intl.get('currencies'));
  }, [changePreferencesPageTitle]);

  return (
    <CurrenciesProvider>
      <CurrenciesActionsBar />
      <CurrenciesDataTable />
    </CurrenciesProvider>
  );
}

export default compose(withDashboardActions)(CurrenciesList);
