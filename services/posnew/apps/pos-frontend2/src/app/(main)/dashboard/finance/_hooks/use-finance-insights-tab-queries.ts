"use client";

import { useQuery } from "@tanstack/react-query";

import {
  posFetchArAging,
  posFetchBalanceSheet,
  posFetchBudgetVsActual,
  posFetchCashFlow,
} from "@/lib/pos-accounting-api";

import { toIsoDateUtc, utcYtdRangeThroughToday } from "../_lib/date-range";
import { fetchProfitLossReport } from "../_lib/fetch-profit-loss-report";
import { FINANCE_QUERY_STALE_MS, financePnlRangeQueryKey } from "../_lib/finance-query-keys";

export function useFinanceInsightsTabQueries(now: Date) {
  const asOf = toIsoDateUtc(now);
  const ytd = utcYtdRangeThroughToday(now);
  const fiscalYear = now.getUTCFullYear();
  const periodMonth = now.getUTCMonth() + 1;

  const balanceSheetQuery = useQuery({
    queryKey: ["finance", "insights", "balance-sheet", asOf] as const,
    queryFn: () => posFetchBalanceSheet({ asOf }),
    staleTime: FINANCE_QUERY_STALE_MS,
  });

  const cashFlowQuery = useQuery({
    queryKey: ["finance", "insights", "cash-flow", ytd.start, ytd.end] as const,
    queryFn: () => posFetchCashFlow({ start: ytd.start, end: ytd.end }),
    staleTime: FINANCE_QUERY_STALE_MS,
  });

  const pnlQuery = useQuery({
    queryKey: financePnlRangeQueryKey(ytd.start, ytd.end),
    queryFn: () => fetchProfitLossReport({ start: ytd.start, end: ytd.end }),
    staleTime: FINANCE_QUERY_STALE_MS,
  });

  const budgetQuery = useQuery({
    queryKey: ["finance", "insights", "budget-vs-actual", fiscalYear, periodMonth] as const,
    queryFn: () => posFetchBudgetVsActual({ fiscalYear, periodMonth }),
    staleTime: FINANCE_QUERY_STALE_MS,
  });

  const arQuery = useQuery({
    queryKey: ["finance", "insights", "ar-aging", asOf] as const,
    queryFn: () => posFetchArAging({ asOf }),
    staleTime: FINANCE_QUERY_STALE_MS,
  });

  return {
    asOf,
    ytd,
    fiscalYear,
    periodMonth,
    balanceSheetQuery,
    cashFlowQuery,
    pnlQuery,
    budgetQuery,
    arQuery,
  };
}
