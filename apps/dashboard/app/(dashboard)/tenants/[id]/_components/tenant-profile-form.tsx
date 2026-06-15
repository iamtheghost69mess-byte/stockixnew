"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { UseFormReturn } from "react-hook-form";

import TenantStatusBadge from "@/components/tenant-status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/date-format";
import type { TenantProfileValues } from "@/lib/schemas";
import type { TenantDetail } from "@/types/tenant";

export type TenantProfileFormProps = {
  tenant: TenantDetail;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  profileForm: UseFormReturn<TenantProfileValues>;
  saving: boolean;
  onSave: (e?: React.BaseSyntheticEvent) => Promise<void>;
  modulesSection?: React.ReactNode;
};

export function TenantProfileForm({
  tenant,
  editing,
  onEditingChange,
  profileForm,
  saving,
  onSave,
  modulesSection,
}: TenantProfileFormProps) {
  const [planSummary, setPlanSummary] = useState<string | null>(null);

  useEffect(() => {
    if (!tenant.planSlug) {
      setPlanSummary(null);
      return;
    }
    void fetch("/api/plans")
      .then((r) => r.json())
      .then((data: { plans?: Array<{ slug: string; name: string; priceMonthly?: number | null }> }) => {
        const plan = (data.plans ?? []).find((p) => p.slug === tenant.planSlug);
        if (!plan) {
          setPlanSummary(tenant.planSlug);
          return;
        }
        const price =
          plan.priceMonthly != null ? ` — $${(plan.priceMonthly / 100).toFixed(2)}/mo catalog` : "";
        setPlanSummary(`${plan.name} (${plan.slug})${price}`);
      })
      .catch(() => setPlanSummary(tenant.planSlug));
  }, [tenant.planSlug]);

  return (
    <Card className="md:col-span-2">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Tenant Profile</CardTitle>
        {!editing ? (
          <Button variant="outline" size="sm" onClick={() => onEditingChange(true)}>
            Edit profile
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {!editing ? (
          <>
            <h2 className="text-2xl font-bold">{tenant.name}</h2>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="font-mono">
                {tenant.slug}
              </Badge>
              <TenantStatusBadge
                status={
                  tenant.status === "partial"
                    ? tenant.status
                    : (tenant.deployment?.status ?? tenant.status)
                }
              />
            </div>
            <div className="grid gap-2 text-sm md:grid-cols-2">
              <p>Admin email: {tenant.adminEmail}</p>
              <p>Admin first name: {tenant.adminFirstName}</p>
              <p>Admin last name: {tenant.adminLastName}</p>
              <p>
                Owner ID: <span className="font-mono">{tenant.ownerId}</span>
              </p>
              <p>
                Plan: <span className="capitalize">{planSummary ?? tenant.planSlug}</span>
              </p>
              <p className="text-muted-foreground text-xs md:col-span-2">
                Internal plan catalog only — no Stripe subscription billing is attached to this tenant.
              </p>
              <p>Created: {formatDateTime(tenant.createdAt)}</p>
            </div>
            {modulesSection}
          </>
        ) : (
          <Form {...profileForm}>
            <form onSubmit={(e) => void onSave(e)} className="space-y-3" noValidate>
              <FormField
                control={profileForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Business name</FormLabel>
                    <FormControl>
                      <Input placeholder="Business name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={profileForm.control}
                name="adminEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Admin email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="admin@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={profileForm.control}
                name="adminFirstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Admin first name</FormLabel>
                    <FormControl>
                      <Input placeholder="First name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={profileForm.control}
                name="adminLastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Admin last name</FormLabel>
                    <FormControl>
                      <Input placeholder="Last name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex gap-2">
                <Button type="submit" disabled={saving}>
                  {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                  Save changes
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    onEditingChange(false);
                    profileForm.reset({
                      name: tenant.name,
                      adminFirstName: tenant.adminFirstName,
                      adminLastName: tenant.adminLastName,
                      adminEmail: tenant.adminEmail,
                    });
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </Form>
        )}
      </CardContent>
    </Card>
  );
}
