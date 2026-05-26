"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { useMe } from "@/hooks/use-me";
import { formatApiError } from "@/lib/api-errors";
import { planEditSchema, planSchema, type PlanEditValues, type PlanValues } from "@/lib/schemas";

import {
  defaultCreateValues,
  parsePlansPayload,
  planBillingApiBody,
  type PlanRow,
} from "./plans-utils";

export function usePlansPage() {
  const { me } = useMe();
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
      maxUsers: 999,
      isActive: true,
      sortOrder: 0,
      currency: "USD",
      isPublic: false,
      featuresText: "",
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
      maxUsers: row.maxUsers,
      isActive: row.isActive,
      sortOrder: row.sortOrder,
      priceMonthly: row.priceMonthly ?? undefined,
      priceAnnually: row.priceAnnually ?? undefined,
      currency: row.currency ?? "USD",
      billingInterval: row.billingInterval as PlanEditValues["billingInterval"] | undefined,
      isPublic: row.isPublic,
      featuresText: row.features.join("\n"),
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
          maxUsers: values.maxUsers,
          isActive: values.isActive,
          sortOrder: values.sortOrder,
          ...planBillingApiBody(values),
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
          maxUsers: values.maxUsers,
          isActive: values.isActive,
          sortOrder: values.sortOrder,
          ...planBillingApiBody(values),
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

  return {
    me,
    canManage,
    plans,
    listLoading,
    listError,
    dialogMode,
    editTarget,
    slugAutoRef,
    deactivateTarget,
    setDeactivateTarget,
    deactivateBusy,
    createForm,
    editForm,
    openCreate,
    openEdit,
    closeDialog,
    onCreateSubmit,
    onEditSubmit,
    confirmDeactivate,
    createUnlimited,
    editUnlimited,
  };
}
