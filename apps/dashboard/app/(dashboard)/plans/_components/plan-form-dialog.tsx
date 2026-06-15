"use client";

import type { MutableRefObject } from "react";
import type { UseFormReturn } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { PlanEditValues, PlanValues } from "@/lib/schemas";

import { PlanFeatureMatrix } from "./plan-feature-matrix";
import { PlanPricingFields } from "./plan-pricing-fields";
import type { PlanRow } from "./plans-utils";
import { slugifyName } from "./plans-utils";

export function PlanFormDialog({
  dialogMode,
  editTarget,
  closeDialog,
  slugAutoRef,
  createForm,
  editForm,
  onCreateSubmit,
  onEditSubmit,
  createUnlimited,
  editUnlimited,
}: {
  dialogMode: "create" | "edit" | null;
  editTarget: PlanRow | null;
  closeDialog: () => void;
  slugAutoRef: MutableRefObject<boolean>;
  createForm: UseFormReturn<PlanValues>;
  editForm: UseFormReturn<PlanEditValues>;
  onCreateSubmit: (e?: React.BaseSyntheticEvent) => Promise<void>;
  onEditSubmit: (e?: React.BaseSyntheticEvent) => Promise<void>;
  createUnlimited: boolean;
  editUnlimited: boolean;
}) {
  return (
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
                <PlanPricingFields form={createForm} />
                <PlanFeatureMatrix form={createForm} unlimited={createUnlimited} />
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
                  <Label htmlFor="edit-plan-slug">Slug</Label>
                  <Input
                    id="edit-plan-slug"
                    value={editTarget.slug}
                    disabled
                    className="font-mono"
                    readOnly
                  />
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
                <PlanPricingFields form={editForm as unknown as UseFormReturn<PlanValues>} />
                <PlanFeatureMatrix form={editForm as unknown as UseFormReturn<PlanValues>} unlimited={editUnlimited} />
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
  );
}
