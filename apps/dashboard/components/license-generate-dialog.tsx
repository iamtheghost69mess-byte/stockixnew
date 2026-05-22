"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "@/components/reusabletoast";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  generateLicenseSchema,
  type GenerateLicenseValues,
} from "@/lib/schemas";

type PlanOpt = { slug: string; name: string };
type TenantOpt = { id: string; name: string; slug: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTenantId?: string;
  onSuccess: () => void;
};

function emptyFormValues(): GenerateLicenseValues {
  return {
    product: "platform",
    planSlug: "starter",
    term: "perpetual",
    expiresAt: undefined,
    maxActivations: 1,
    gracePeriodDays: 7,
    notes: "",
    count: 1,
    validFrom: undefined,
  };
}

export default function LicenseGenerateDialog({
  open,
  onOpenChange,
  defaultTenantId,
  onSuccess,
}: Props) {
  const [plans, setPlans] = useState<PlanOpt[]>([]);
  const [tenants, setTenants] = useState<TenantOpt[]>([]);
  const [tenantId, setTenantId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedKeys, setGeneratedKeys] = useState<string[]>([]);

  const form = useForm<GenerateLicenseValues>({
    resolver: zodResolver(generateLicenseSchema),
    defaultValues: emptyFormValues(),
    mode: "onSubmit",
    reValidateMode: "onChange",
  });

  const term = form.watch("term");
  const product = form.watch("product");

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      form.reset(emptyFormValues());
      setGeneratedKeys([]);
      setError(null);
    }
    onOpenChange(next);
  };

  useEffect(() => {
    if (!open) {
      return;
    }
    form.reset(emptyFormValues());
    setGeneratedKeys([]);
    setError(null);
    void (async () => {
      const [pRes, tRes] = await Promise.all([
        fetch("/api/plans"),
        fetch("/api/tenants?page=1&pageSize=1000"),
      ]);
      const pJson = (await pRes.json().catch(() => ({}))) as {
        plans?: { slug: string; name: string; isActive?: boolean }[];
      };
      const tJson = (await tRes.json().catch(() => ({}))) as {
        tenants?: { tenantId: string; name: string; slug: string }[];
      };
      if (pRes.ok && pJson.plans?.length) {
        const list = pJson.plans
          .filter((p) => p.isActive !== false)
          .map((p) => ({ slug: p.slug, name: p.name }));
        if (list.length > 0) {
          setPlans(list);
          const prev = form.getValues("planSlug");
          const nextSlug = list.some((p) => p.slug === prev) ? prev : list[0]!.slug;
          form.setValue("planSlug", nextSlug, { shouldValidate: false });
        } else {
          setPlans([]);
        }
      }
      if (tRes.ok && Array.isArray(tJson.tenants)) {
        setTenants(
          tJson.tenants.map((t) => ({ id: t.tenantId, name: t.name, slug: t.slug })),
        );
      }
    })();
  }, [open, form]);

  useEffect(() => {
    if (open && defaultTenantId) {
      setTenantId(defaultTenantId);
    }
    if (open && !defaultTenantId) {
      setTenantId("");
    }
  }, [open, defaultTenantId]);

  const onSubmit = form.handleSubmit(async (values) => {
    setLoading(true);
    setError(null);
    setGeneratedKeys([]);
    try {
      const isPerpetual = values.term === "perpetual";
      const body = {
        product: values.product,
        planSlug: values.planSlug,
        count: values.count,
        isPerpetual,
        expiresAt:
          !isPerpetual && values.expiresAt ? values.expiresAt : undefined,
        validFrom: values.validFrom ? values.validFrom : undefined,
        maxActivations: values.product === "platform" ? 1 : values.maxActivations,
        gracePeriodDays: values.gracePeriodDays,
        notes: values.notes?.trim() || undefined,
        tenantId: tenantId || undefined,
      };
      const res = await fetch("/api/licenses/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        licenses?: { licenseKey: string }[];
        detail?: unknown;
      };
      if (!res.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : `Failed (${res.status})`,
        );
        return;
      }
      const keys = (data.licenses ?? []).map((l) => l.licenseKey);
      setGeneratedKeys(keys);
      if (keys.length === 1) {
        toast.success(`License generated: ${keys[0]}`);
      } else {
        toast.success(`${keys.length} licenses generated`);
      }
      window.setTimeout(() => {
        onSuccess();
        handleOpenChange(false);
        setGeneratedKeys([]);
        form.reset(emptyFormValues());
      }, 1500);
    } finally {
      setLoading(false);
    }
  });

  const copyAll = async () => {
    await navigator.clipboard.writeText(generatedKeys.join("\n"));
    toast.success("Copied all keys");
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[min(90vh,800px)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Generate licenses</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            id="license-generate-form"
            className="space-y-4"
            onSubmit={(e) => void onSubmit(e)}
            noValidate
          >
            <FormField
              control={form.control}
              name="product"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Product</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={(v) =>
                      field.onChange(v as GenerateLicenseValues["product"])
                    }
                  >
                    <FormControl>
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="platform">Platform</SelectItem>
                      <SelectItem value="pos_desktop">POS Desktop</SelectItem>
                      <SelectItem value="bundle">Bundle</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="planSlug"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Plan</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {plans.map((p) => (
                        <SelectItem key={p.slug} value={p.slug}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="count"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Count</FormLabel>
                  <FormControl>
                    <Input
                      className="mt-1"
                      type="number"
                      min={1}
                      max={100}
                      value={field.value}
                      onChange={(e) =>
                        field.onChange(Number(e.target.value) || 1)
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="space-y-2">
              <FormField
                control={form.control}
                name="term"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>License type</FormLabel>
                    <ToggleGroup
                      multiple={false}
                      value={[field.value]}
                      onValueChange={(value) => {
                        const next = value[0];
                        if (next === "fixed" || next === "perpetual") {
                          field.onChange(next);
                        }
                      }}
                      variant="outline"
                      spacing={2}
                      className="grid w-full grid-cols-2 gap-2"
                    >
                      <ToggleGroupItem
                        value="perpetual"
                        className="flex h-auto flex-col items-start gap-1 px-3 py-3 text-left"
                      >
                        <span className="text-sm font-medium">Perpetual</span>
                        <span className="text-xs font-normal text-muted-foreground">
                          No expiry date
                        </span>
                      </ToggleGroupItem>
                      <ToggleGroupItem
                        value="fixed"
                        className="flex h-auto flex-col items-start gap-1 px-3 py-3 text-left"
                      >
                        <span className="text-sm font-medium">Fixed term</span>
                        <span className="text-xs font-normal text-muted-foreground">
                          Set an expiry date
                        </span>
                      </ToggleGroupItem>
                    </ToggleGroup>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {term === "fixed" ? (
                <FormField
                  control={form.control}
                  name="expiresAt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Expiry date</FormLabel>
                      <Popover>
                        <FormControl>
                          <PopoverTrigger
                            render={
                              <Button
                                type="button"
                                variant="outline"
                                className="w-full justify-start font-normal"
                              >
                                {field.value
                                  ? format(new Date(field.value), "PPP")
                                  : "Pick expiry date"}
                              </Button>
                            }
                          />
                        </FormControl>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={
                              field.value ? new Date(field.value) : undefined
                            }
                            onSelect={(d) =>
                              field.onChange(d ? d.toISOString() : undefined)
                            }
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : null}
              <FormField
                control={form.control}
                name="validFrom"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Valid from (optional)</FormLabel>
                    <FormDescription className="text-xs">
                      When the license becomes valid. Defaults to now when assigned
                      or generated with a tenant.
                    </FormDescription>
                    <Popover>
                      <FormControl>
                        <PopoverTrigger
                          render={
                            <Button
                              type="button"
                              variant="outline"
                              className="mt-1 w-full justify-start font-normal"
                            >
                              {field.value
                                ? format(new Date(field.value), "PPP")
                                : "Default (now / assignment time)"}
                            </Button>
                          }
                        />
                      </FormControl>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={
                            field.value ? new Date(field.value) : undefined
                          }
                          onSelect={(d) =>
                            field.onChange(d ? d.toISOString() : undefined)
                          }
                        />
                        <div className="border-t p-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="w-full"
                            onClick={() => field.onChange(undefined)}
                          >
                            Clear
                          </Button>
                        </div>
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            {product !== "platform" ? (
              <FormField
                control={form.control}
                name="maxActivations"
                render={({ field }) => (
                  <FormItem className="transition-all">
                    <FormLabel>Max activations</FormLabel>
                    <FormControl>
                      <Input
                        className="mt-1"
                        type="number"
                        min={1}
                        max={50}
                        value={field.value}
                        onChange={(e) =>
                          field.onChange(Number(e.target.value) || 1)
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}
            <FormField
              control={form.control}
              name="gracePeriodDays"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Offline grace period (days)</FormLabel>
                  <FormControl>
                    <Input
                      className="mt-1"
                      type="number"
                      min={0}
                      max={365}
                      value={field.value}
                      onChange={(e) =>
                        field.onChange(Number(e.target.value) || 0)
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div>
              <Label>Assign to tenant (optional)</Label>
              <Select
                value={tenantId || "__none__"}
                onValueChange={(v) =>
                  setTenantId(v === "__none__" || v == null ? "" : v)
                }
                disabled={Boolean(defaultTenantId)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {tenants.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} ({t.slug})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      className="mt-1"
                      rows={2}
                      value={field.value ?? ""}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            {generatedKeys.length > 0 ? (
              <div className="rounded-md border p-3 text-sm">
                <p className="font-medium">
                  {generatedKeys.length === 1 ? "Generated key" : "Generated keys"}
                </p>
                <ul className="mt-2 max-h-32 overflow-y-auto font-mono text-xs">
                  {generatedKeys.map((k) => (
                    <li key={k}>{k}</li>
                  ))}
                </ul>
                {generatedKeys.length > 1 ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => void copyAll()}
                  >
                    Copy all
                  </Button>
                ) : null}
              </div>
            ) : null}
          </form>
        </Form>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="license-generate-form"
            disabled={loading}
          >
            {loading ? "Generating…" : "Generate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
