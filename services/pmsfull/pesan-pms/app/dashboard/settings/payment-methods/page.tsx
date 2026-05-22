"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SettingsPaymentMethodsPage() {
  const router = useRouter();

  // Redirect to the settings page with the payment-methods tab active
  useEffect(() => {
    router.replace("/dashboard/settings?tab=payment-methods");
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="text-center">
        <h3 className="text-lg font-medium mb-2">Redirecting...</h3>
        <p className="text-sm text-muted-foreground">
          Please wait while we redirect you to the payment methods settings.
        </p>
      </div>
    </div>
  );
}
