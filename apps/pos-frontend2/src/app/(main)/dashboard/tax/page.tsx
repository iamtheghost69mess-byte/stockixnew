import { Suspense } from "react";

import { Loader2 } from "lucide-react";

import { TaxSettingsClient } from "./_components/tax-settings-client";

export default function TaxPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center p-16">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      }
    >
      <TaxSettingsClient />
    </Suspense>
  );
}
