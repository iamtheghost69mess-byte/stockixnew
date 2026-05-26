import { Suspense } from "react";

import { TenantsPageContent } from "./_components/tenants-page-content";

export default function TenantsPage() {
  return (
    <Suspense
      fallback={
        <div className="w-full space-y-8 p-6 text-sm text-muted-foreground">Loading tenants…</div>
      }
    >
      <TenantsPageContent />
    </Suspense>
  );
}
