"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { CheckCircle2, Circle, MoreHorizontal, Pencil, Plus, Power } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useMe } from "@/hooks/use-me";
import { formatApiError } from "@/lib/api-errors";
import { planEditSchema, planSchema, type PlanEditValues, type PlanValues } from "@/lib/schemas";

export type PlanRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  maxOrganizations: number;
  maxActivations: number;
  isActive: boolean;
  sortOrder: number;
  activeLicenseCount: number;
  createdAt: string;
  updatedAt: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export function slugifyName(name: string): string {
  const s = name
    .toLowerCase()
    .trim()
    .replace(/[''`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  return s.length >= 2 ? s : "";
}

function parsePlansPayload(body: unknown): PlanRow[] {
  if (!isRecord(body) || !Array.isArray(body.plans)) return [];
  const out: PlanRow[] = [];
  for (const row of body.plans) {
    if (!isRecord(row)) continue;
    if (
      typeof row.id !== "string"
      || typeof row.name !== "string"
      || typeof row.slug !== "string"
      || typeof row.isActive !== "boolean"
      || typeof row.sortOrder !== "number"
      || typeof row.maxOrganizations !== "number"
      || typeof row.maxActivations !== "number"
    ) {
      continue;
    }
    out.push({
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: typeof row.description === "string" ? row.description : null,
      maxOrganizations: row.maxOrganizations,
      maxActivations: row.maxActivations,
      isActive: row.isActive,
      sortOrder: row.sortOrder,
      activeLicenseCount: typeof row.activeLicenseCount === "number" ? row.activeLicenseCount : 0,
      createdAt: typeof row.createdAt === "string" ? row.createdAt : "",
      updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : "",
    });
  }
  return out;
}

const defaultCreateValues: PlanValues = {
  name: "",
  slug: "",
  description: undefined,
  maxOrganizations: 1,
  maxActivations: 1,
  isActive: true,
  sortOrder: 0,
};

export default function PlansPage() {
  const me = useMe();
  const canManage = Boolean(me?.capabilities.canAccessSettings);

  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [dialogMode, setDialogMode] = useState<"create" | "edit" | null>(null);
  const [editTarget, setEditTarget] = useState<PlanRow | null>(null);
  const slugAutoRef = useRef(true);

  const [deactivateTarget, setDeactivateTarget] = useState<PlanRow | null>(null);
  const [deactivateBusy, setDeactivateBusy] = useState(false);

  const createForm = useForm<PlanValues>({
    resolver: zodResolver(planSchema),
    defaultValues: defaultCreateValues,
  });

  const editForm = useForm<PlanEditValues>({
    resolver: zodResolver(planEditSchema),
    defaultValues: {
      name: "",
      description: "",
      maxOrganizations: 1,
      maxActivations: 1,
      isActive: true,
      sortOrder: 0,
    },
  });

  const loadPlans = useCallback(async () => {
    if (!canManage) return;
    setListLoading(true);
    setListError(null);
    try {
      const res = await fetch("/api/plans");
      const data: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        setListError(formatApiError(data, res.status === 403 ? "Access denied" : `HTTP ${res.status}`));
        setPlans([]);
        return;
      }
      setPlans(parsePlansPayload(data));
    } catch {
      setListError("Failed to load plans.");
      setPlans([]);
    } finally {
      setListLoading(false);
    }
  }, [canManage]);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  const openCreate = () => {
    setEditTarget(null);
    slugAutoRef.current = true;
    createForm.reset(defaultCreateValues);
    setDialogMode("create");
  };

  const openEdit = (row: PlanRow) => {
    setEditTarget(row);
    editForm.reset({
      name: row.name,
      description: row.description ?? "",
      maxOrganizations: row.maxOrganizations,
      maxActivations: row.maxActivations,
      isActive: row.isActive,
      sortOrder: row.sortOrder,
    });
    setDialogMode("edit");
  };

  const closeDialog = () => {
    setDialogMode(null);
    setEditTarget(null);
  };

  const onCreateSubmit = createForm.handleSubmit(async (values) => {
    setListError(null);
    try {
      const res = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: values.name.trim(),
          slug: values.slug.trim(),
          description: values.description?.trim() || undefined,
          maxOrganizations: values.maxOrganizations,
          maxActivations: values.maxActivations,
          isActive: values.isActive,
          sortOrder: values.sortOrder,
        }),
      });
      const data: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        setListError(formatApiError(data, `HTTP ${res.status}`));
        return;
      }
      closeDialog();
      await loadPlans();
    } catch {
      setListError("Failed to create plan.");
    }
  });

  const onEditSubmit = editForm.handleSubmit(async (values) => {
    if (!editTarget) return;
    setListError(null);
    try {
      const res = await fetch(`/api/plans/${editTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: values.name.trim(),
          description: values.description?.trim() ? values.description.trim() : null,
          maxOrganizations: values.maxOrganizations,
          maxActivations: values.maxActivations,
          isActive: values.isActive,
          sortOrder: values.sortOrder,
        }),
      });
      const data: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        setListError(formatApiError(data, `HTTP ${res.status}`));
        return;
      }
      closeDialog();
      await loadPlans();
    } catch {
      setListError("Failed to update plan.");
    }
  });

  const confirmDeactivate = async () => {
    if (!deactivateTarget) return;
    setDeactivateBusy(true);
    setListError(null);
    try {
      const res = await fetch(`/api/plans/${deactivateTarget.id}`, { method: "DELETE" });
      const data: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        setListError(formatApiError(data, `HTTP ${res.status}`));
        return;
      }
      setDeactivateTarget(null);
      await loadPlans();
    } catch {
      setListError("Failed to deactivate plan.");
    } finally {
      setDeactivateBusy(false);
    }
  };

  const createUnlimited = createForm.watch("maxOrganizations") === -1;
  const editUnlimited = editForm.watch("maxOrganizations") === -1;

  if (me && !canManage) {
    return (
      <Card className="max-w-lg border-destructive/40">
        <CardHeader>
          <CardTitle>Access denied</CardTitle>
          <CardDescription>Plans are restricted to Super Admins.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Plans</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Plans</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Catalog used by license generation and tenant provisioning (read-only for operators; Super
              Admin can manage).
            </p>
          </div>
        </div>
        {canManage ? (
          <Button type="button" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Create plan
          </Button>
        ) : null}
      </div>

      {listError ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {listError}
        </p>
      ) : null}

      {canManage ? (
        <div className="rounded-xl border border-border/80 bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[100px]">Sort</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="min-w-[120px]">Slug</TableHead>
                <TableHead className="text-right">Max orgs</TableHead>
                <TableHead className="text-right">Activations</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[60px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {listLoading && plans.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : null}
              {!listLoading && plans.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                    No plans yet. Create a plan to use it in license and tenant flows.
                  </TableCell>
                </TableRow>
              ) : null}
              {plans.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-muted-foreground">{row.sortOrder}</TableCell>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell className="font-mono text-sm">{row.slug}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.maxOrganizations === -1 ? "Unlimited" : row.maxOrganizations}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row.maxActivations}</TableCell>
                  <TableCell>
                    {row.isActive ? (
                      <Badge className="gap-1 border-emerald-600/30 bg-emerald-600/15 text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1">
                        <Circle className="h-3.5 w-3.5" />
                        Inactive
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Plan actions" />
                        }
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(row)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit plan
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={!row.isActive || row.activeLicenseCount > 0}
                          title={
                            row.activeLicenseCount > 0
                              ? "Cannot deactivate while active licenses use this plan."
                              : !row.isActive
                                ? "Plan is already inactive."
                                : undefined
                          }
                          onClick={() => setDeactivateTarget(row)}
                        >
                          <Power className="mr-2 h-4 w-4" />
                          Deactivate
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      <Dialog
        open={dialogMode !== null}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          {dialogMode === "create" ? (
            <>
              <DialogHeader>
                <DialogTitle>Create plan</DialogTitle>
              </DialogHeader>
              <Form {...createForm}>
                <form onSubmit={onCreateSubmit} className="space-y-4">
                  <FormField
                    control={createForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            autoComplete="off"
                            onBlur={(e) => {
                              field.onBlur();
                              if (slugAutoRef.current) {
                                const s = slugifyName(e.target.value);
                                if (s) createForm.setValue("slug", s, { shouldValidate: true });
                              }
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={createForm.control}
                    name="slug"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Slug</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            className="font-mono"
                            autoComplete="off"
                            onChange={(e) => {
                              slugAutoRef.current = false;
                              field.onChange(e);
                            }}
                          />
                        </FormControl>
                        <FormDescription>Lowercase identifier; used as a stable reference in licenses.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={createForm.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea {...field} value={field.value ?? ""} rows={3} className="resize-none" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex flex-wrap items-center gap-4">
                    <FormField
                      control={createForm.control}
                      name="maxOrganizations"
                      render={({ field }) => (
                        <FormItem>
                          <div className="flex items-center gap-2">
                            <Checkbox
                              checked={createUnlimited}
                              onCheckedChange={(checked) => {
                                if (checked === true) {
                                  createForm.setValue("maxOrganizations", -1, { shouldValidate: true });
                                } else {
                                  createForm.setValue("maxOrganizations", 1, { shouldValidate: true });
                                }
                              }}
                            />
                            <FormLabel className="mt-0! font-normal">Unlimited organizations (-1)</FormLabel>
                          </div>
                          {!createUnlimited ? (
                            <>
                              <FormControl>
                                <Input
                                  type="number"
                                  min={1}
                                  max={9999}
                                  className="w-28"
                                  {...field}
                                  value={field.value === -1 ? 1 : field.value}
                                  onChange={(e) => field.onChange(e.target.value === "" ? "" : Number(e.target.value))}
                                />
                              </FormControl>
                              <FormMessage />
                            </>
                          ) : (
                            <FormMessage />
                          )}
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={createForm.control}
                      name="maxActivations"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Max activations</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={1}
                              max={9999}
                              className="w-28"
                              {...field}
                              onChange={(e) => field.onChange(e.target.value === "" ? "" : Number(e.target.value))}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={createForm.control}
                    name="sortOrder"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sort order</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            max={9999}
                            className="w-28"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value === "" ? "" : Number(e.target.value))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={createForm.control}
                    name="isActive"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center gap-2 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={(v) => field.onChange(v === true)}
                          />
                        </FormControl>
                        <FormLabel className="mt-0! font-normal">Active</FormLabel>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DialogFooter className="gap-2 sm:gap-0">
                    <Button type="button" variant="outline" onClick={closeDialog}>
                      Cancel
                    </Button>
                    <Button type="submit">Create</Button>
                  </DialogFooter>
                </form>
              </Form>
            </>
          ) : null}
          {dialogMode === "edit" && editTarget ? (
            <>
              <DialogHeader>
                <DialogTitle>Edit plan</DialogTitle>
              </DialogHeader>
              <Form {...editForm}>
                <form onSubmit={onEditSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <FormLabel>Slug</FormLabel>
                    <Input value={editTarget.slug} disabled className="font-mono" readOnly />
                    <p className="text-xs text-muted-foreground">Slug cannot be changed; it is referenced by licenses.</p>
                  </div>
                  <FormField
                    control={editForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name</FormLabel>
                        <FormControl>
                          <Input {...field} autoComplete="off" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea {...field} value={field.value ?? ""} rows={3} className="resize-none" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex flex-wrap items-center gap-4">
                    <FormField
                      control={editForm.control}
                      name="maxOrganizations"
                      render={({ field }) => (
                        <FormItem>
                          <div className="flex items-center gap-2">
                            <Checkbox
                              checked={editUnlimited}
                              onCheckedChange={(checked) => {
                                if (checked === true) {
                                  editForm.setValue("maxOrganizations", -1, { shouldValidate: true });
                                } else {
                                  editForm.setValue("maxOrganizations", 1, { shouldValidate: true });
                                }
                              }}
                            />
                            <FormLabel className="mt-0! font-normal">Unlimited organizations (-1)</FormLabel>
                          </div>
                          {!editUnlimited ? (
                            <>
                              <FormControl>
                                <Input
                                  type="number"
                                  min={1}
                                  max={9999}
                                  className="w-28"
                                  {...field}
                                  value={field.value === -1 ? 1 : field.value}
                                  onChange={(e) => field.onChange(e.target.value === "" ? "" : Number(e.target.value))}
                                />
                              </FormControl>
                              <FormMessage />
                            </>
                          ) : (
                            <FormMessage />
                          )}
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={editForm.control}
                      name="maxActivations"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Max activations</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={1}
                              max={9999}
                              className="w-28"
                              {...field}
                              onChange={(e) => field.onChange(e.target.value === "" ? "" : Number(e.target.value))}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={editForm.control}
                    name="sortOrder"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sort order</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            max={9999}
                            className="w-28"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value === "" ? "" : Number(e.target.value))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="isActive"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center gap-2 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={(v) => field.onChange(v === true)}
                          />
                        </FormControl>
                        <FormLabel className="mt-0! font-normal">Active</FormLabel>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DialogFooter className="gap-2 sm:gap-0">
                    <Button type="button" variant="outline" onClick={closeDialog}>
                      Cancel
                    </Button>
                    <Button type="submit">Save changes</Button>
                  </DialogFooter>
                </form>
              </Form>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deactivateTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeactivateTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate plan?</AlertDialogTitle>
            <AlertDialogDescription>
              {deactivateTarget
                ? `“${deactivateTarget.name}” (${deactivateTarget.slug}) will be hidden from pickers. This does not remove existing license rows.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deactivateBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deactivateBusy}
              onClick={(e) => {
                e.preventDefault();
                void confirmDeactivate();
              }}
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
