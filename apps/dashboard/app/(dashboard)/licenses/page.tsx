"use client";

import { Suspense } from "react";

import { LicensesPageContent } from "./_components/licenses-page-content";

export default function LicensesPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6 p-6 text-sm text-muted-foreground">Loading licenses…</div>
      }
    >
      <LicensesPageContent />
    </Suspense>
  );
}
