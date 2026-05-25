"use client";

import { PlansPageContent } from "./_components/plans-page-content";

export type { PlanRow } from "./_components/plans-utils";
export { slugifyName } from "./_components/plans-utils";

export default function PlansPage() {
  return <PlansPageContent />;
}
