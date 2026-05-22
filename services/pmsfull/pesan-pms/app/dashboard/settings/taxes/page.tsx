"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SettingsTaxesPage() {
  const router = useRouter();

  // Redirect to the settings page with the taxes tab active
  useEffect(() => {
    router.replace("/dashboard/settings?tab=taxes");
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="text-center">
        <h3 className="text-lg font-medium mb-2">Redirecting...</h3>
        <p className="text-sm text-muted-foreground">
          Please wait while we redirect you to the taxes & fees settings.
        </p>
      </div>
    </div>
  );
}
