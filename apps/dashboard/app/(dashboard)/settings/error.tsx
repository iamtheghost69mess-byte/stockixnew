"use client";

import { RouteError } from "@/components/route-error";

type ErrorBoundaryProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorBoundary({ error, reset }: ErrorBoundaryProps) {
  return <RouteError error={error} reset={reset} />;
}
