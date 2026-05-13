"use client";

import { useEffect } from "react";

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
        <button
          type="button"
          className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-accent"
          onClick={() => reset()}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
