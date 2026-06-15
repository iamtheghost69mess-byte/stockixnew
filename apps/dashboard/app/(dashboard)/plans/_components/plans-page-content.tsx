"use client";

import { Plus } from "lucide-react";

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

import { PlanFormDialog } from "./plan-form-dialog";
import { PlanList } from "./plan-list";
import { usePlansPage } from "./use-plans-page";

export function PlansPageContent() {
  const {
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
  } = usePlansPage();

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
        <PlanList
          plans={plans}
          listLoading={listLoading}
          onEdit={openEdit}
          onDeactivate={setDeactivateTarget}
        />
      ) : null}

      <PlanFormDialog
        dialogMode={dialogMode}
        editTarget={editTarget}
        closeDialog={closeDialog}
        slugAutoRef={slugAutoRef}
        createForm={createForm}
        editForm={editForm}
        onCreateSubmit={onCreateSubmit}
        onEditSubmit={onEditSubmit}
        createUnlimited={createUnlimited}
        editUnlimited={editUnlimited}
      />

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
