"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function SettingsUsersPage() {
  const router = useRouter();

  // Redirect to the settings page with the users tab active
  useEffect(() => {
    router.replace("/dashboard/settings?tab=users");
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="text-center">
        <h3 className="text-lg font-medium mb-2">Redirecting...</h3>
        <p className="text-sm text-muted-foreground">
          Please wait while we redirect you to the users settings.
        </p>
      </div>
    </div>
  );
}
