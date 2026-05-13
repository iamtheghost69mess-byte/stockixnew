"use client";

import { useEffect } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-6">
      <Alert variant="destructive" className="max-w-md">
        <AlertTitle>Something went wrong</AlertTitle>
        <AlertDescription>{error.message || "An unexpected error occurred in this section."}</AlertDescription>
      </Alert>
      <Button type="button" onClick={() => reset()}>
        Try again
      </Button>
    </div>
  );
}
