// @ts-nocheck

import { useRequestQuery } from '../../useQueryRequest';
import t from '../types';

export function useUnrealizedGainOrLoss(query, props) {
  return useRequestQuery(
    [t.FINANCIAL_REPORT, t.UNREALIZED_GAIN_OR_LOSS, query],
    {
      method: 'get',
      url: '/reports/unrealized-gain-loss',
      params: query,
    },
    {
      select: (res) => res.data,
      defaultData: { entries: [], arTotal: 0, apTotal: 0, total: 0 },
      ...props,
    },
  );
}
