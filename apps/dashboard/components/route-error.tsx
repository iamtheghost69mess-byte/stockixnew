"use client";

import { useEffect } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface RouteErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
}

export function RouteError({
  error,
  reset,
  title = "Something went wrong",
}: RouteErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[400px] items-center justify-center p-6">
      <Card className="w-full max-w-md border-destructive/40">
        <CardHeader className="flex flex-row items-center gap-3">
          <AlertCircle className="h-5 w-5 text-destructive" />
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {error.message || "An unexpected error occurred."}
          </p>
          {error.digest ? (
            <p className="mt-2 font-mono text-xs text-muted-foreground">
              Error ID: {error.digest}
            </p>
          ) : null}
        </CardContent>
        <CardFooter className="gap-2">
          <Button onClick={reset} size="sm">
            Try again
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => (window.location.href = "/")}
          >
            Go to dashboard
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
