"use client";

import { useState } from "react";

import { useQuery } from "@tanstack/react-query";

import { AccessGate } from "@/components/access-gate";
import { ResourceTable } from "@/components/resource-table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/use-debounce";
import { parseApiResponse } from "@/lib/mdd/parse-api-response";
import type { ResourceDefinition } from "@/lib/mdd/resource-config";
import { posApiJson } from "@/lib/pos-api-fetch";

interface ResourcePageProps {
  resource: ResourceDefinition;
  /** Optional: extra title or description overrides. */
  title?: string;
  description?: string;
  /** If true, breadcrumbs and headers are hidden (useful for tabs). */
  minimal?: boolean;
  /** Extra primary actions (e.g. Create button). */
  extraActions?: React.ReactNode;
  /**
   * Optional custom action handler.
   * If provided, it overrides the default logic for interactive fields.
   */
  onAction?: (row: any, actionId: string, value: any) => void;
  /** Extra query parameters to include in the API request. */
  params?: Record<string, string | number | boolean | undefined>;
  /** Copy when the list loads successfully but returns zero rows. */
  tableEmptyMessage?: string;
  /** Optional custom content instead of the default ResourceTable. */
  children?: (data: any[], isLoading: boolean) => React.ReactNode;
}

/**
 * Professional Tenant Dashboard Generator.
 * Optimized for enterprise performance with debounced searching and interactive row support.
 */
export function ResourcePage({
  resource,
  title,
  description,
  minimal,
  extraActions,
  onAction,
  params,
  tableEmptyMessage,
  children,
}: ResourcePageProps) {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 400);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: [resource.id, { search: debouncedSearch, ...params }],
    queryFn: async () => {
      const u = new URLSearchParams();
      const param = resource.searchParam || "search";
      if (debouncedSearch) u.set(param, debouncedSearch);

      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          if (v !== undefined) u.set(k, String(v));
        });
      }

      const raw = await posApiJson<unknown>(
        `${resource.apiPath}${resource.apiPath.includes("?") ? "&" : "?"}${u.toString()}`,
      );
      const parsed = parseApiResponse(resource.schema, raw, resource.label);
      return resource.dataSelector(parsed);
    },
  });

  return (
    <AccessGate permission={resource.permission}>
      <div className="space-y-6">
        {!minimal && (
          <>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between font-outfit">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">{title || resource.label}</h1>
                <p className="text-sm text-muted-foreground">
                  {description || `Manage ${resource.label.toLowerCase()} operations.`}
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="w-full sm:w-64">
                  <Input
                    placeholder={`Search ${resource.label.toLowerCase()}...`}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="bg-card/50"
                  />
                </div>
                {extraActions}
              </div>
            </div>
          </>
        )}

        {isError && (
          <Alert variant="destructive" className="border-destructive/10 bg-destructive/5">
            <AlertTitle className="font-semibold">Sync Failure</AlertTitle>
            <AlertDescription className="flex items-center justify-between mt-2">
              <span className="text-sm opacity-90">
                {error instanceof Error ? error.message : "The remote resource could not be fetched."}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void refetch()}
                className="border-destructive/20 hover:bg-destructive/10"
              >
                Retry Connection
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {children ? (
          children(data || [], isLoading)
        ) : (
          <ResourceTable
            columns={resource.columns}
            data={data || []}
            isLoading={isLoading}
            emptyMessage={tableEmptyMessage}
            onAction={onAction}
          />
        )}
      </div>
    </AccessGate>
  );
}
