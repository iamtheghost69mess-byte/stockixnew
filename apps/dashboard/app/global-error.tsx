"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function GlobalError({
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
    <html lang="en">
      <body className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 font-sans text-foreground">
        <h1 className="text-xl font-semibold">Application error</h1>
        <p className="max-w-md text-center text-sm text-muted-foreground">
          {error.message || "A critical error occurred. You can try reloading the page."}
        </p>
        <Button type="button" onClick={() => reset()}>
          Try again
        </Button>
      </body>
    </html>
  );
}
