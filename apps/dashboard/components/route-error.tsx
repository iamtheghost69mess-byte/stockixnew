"use client";

import { useEffect } from "react";

export type RouteErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
};

function errorMessage(error: Error & { digest?: string }): string {
  if (error instanceof Error && error.message) return error.message;
  return "An unexpected error occurred.";
}

/** Client error UI for Next.js `error.tsx` boundaries (no heavy UI imports). */
function RouteError({
  error,
  reset,
  title = "Something went wrong",
}: RouteErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[400px] items-center justify-center p-6">
      <div
        role="alert"
        className="w-full max-w-md rounded-xl border border-destructive/40 bg-card p-6 text-card-foreground shadow-sm ring-1 ring-foreground/10"
      >
        <h2 className="text-base font-semibold text-destructive">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{errorMessage(error)}</p>
        {error.digest ? (
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            Error ID: {error.digest}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex h-8 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => {
              window.location.href = "/";
            }}
            className="inline-flex h-8 items-center justify-center rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-muted"
          >
            Go to dashboard
          </button>
        </div>
      </div>
    </div>
  );
}

export { RouteError };
export default RouteError;
