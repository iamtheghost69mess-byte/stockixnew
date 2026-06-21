"use client";

import * as React from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type CrmErrorBoundaryState = {
  readonly error: Error | null;
  readonly resetKey: number;
};

/**
 * Catches render/lifecycle errors under the operations dashboard so navigation
 * and chart bugs do not blank the entire shell.
 */
export class CrmErrorBoundary extends React.Component<React.PropsWithChildren, CrmErrorBoundaryState> {
  state: CrmErrorBoundaryState = { error: null, resetKey: 0 };

  static getDerivedStateFromError(error: Error): Pick<CrmErrorBoundaryState, "error"> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    if (process.env.NODE_ENV === "development") {
      console.error("[CRM] ErrorBoundary:", error.message, info.componentStack);
    }
  }

  private readonly handleRetry = (): void => {
    this.setState((s) => ({ error: null, resetKey: s.resetKey + 1 }));
  };

  render(): React.ReactNode {
    if (this.state.error != null) {
      return (
        <div className="flex flex-col gap-4 p-6">
          <Alert variant="destructive">
            <AlertTitle>Operations dashboard</AlertTitle>
            <AlertDescription className="flex flex-col gap-3">
              <p className="text-sm">{this.state.error.message}</p>
              <Button type="button" variant="outline" size="sm" className="w-fit" onClick={this.handleRetry}>
                Reload section
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      );
    }

    return <div key={this.state.resetKey}>{this.props.children}</div>;
  }
}
