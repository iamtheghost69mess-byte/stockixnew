import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { CardOverview } from "./_components/card-overview";
import { CashFlowOverview } from "./_components/cash-flow-overview";
import { FinanceActivityTab } from "./_components/finance-activity-tab";
import { FinanceDemoOverview } from "./_components/finance-demo-overview";
import { FinanceInsightsTab } from "./_components/finance-insights-tab";
import { FinanceUtilitiesTab } from "./_components/finance-utilities-tab";
import { IncomeReliability } from "./_components/income-reliability";
import { MonthlyCashFlow } from "./_components/kpis/monthly-cash-flow";
import { NetWorth } from "./_components/kpis/net-worth";
import { PrimaryAccount } from "./_components/kpis/primary-account";
import { SavingsRate } from "./_components/kpis/savings-rate";
import { SpendingBreakdown } from "./_components/spending-breakdown";

type FinancePageSearchParams = {
  readonly demo?: string | string[];
};

function isFinanceDemoMode(searchParams: FinancePageSearchParams): boolean {
  const raw = searchParams.demo;
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === "1" || v === "true";
}

type FinancePageProps = {
  readonly searchParams: Promise<FinancePageSearchParams>;
};

export default async function Page(props: Readonly<FinancePageProps>) {
  const searchParams = await props.searchParams;
  const demo = isFinanceDemoMode(searchParams);

  return (
    <div>
      <Tabs className="gap-4" defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
          <TabsTrigger value="utilities">Utilities</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          {demo ? (
            <FinanceDemoOverview />
          ) : (
            <div className="flex flex-col gap-4 *:data-[slot=card]:shadow-xs">
              <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:gap-2 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4">
                <PrimaryAccount />
                <NetWorth />
                <MonthlyCashFlow />
                <SavingsRate />
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
                <div className="flex flex-col gap-4">
                  <CashFlowOverview />

                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <SpendingBreakdown />
                    <IncomeReliability />
                  </div>
                </div>

                <CardOverview />
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="activity">
          <FinanceActivityTab />
        </TabsContent>

        <TabsContent value="insights">
          <FinanceInsightsTab />
        </TabsContent>

        <TabsContent value="utilities">
          <FinanceUtilitiesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
