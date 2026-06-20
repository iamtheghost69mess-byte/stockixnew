"use client";

import type { UseFormReturn } from "react-hook-form";

import { Checkbox } from "@repo/ui/checkbox";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@repo/ui/form";
import { Input } from "@repo/ui/input";
import type { PlanValues } from "@/lib/schemas";

export function PlanFeatureMatrix({
  form,
  unlimited,
}: {
  form: UseFormReturn<PlanValues>;
  unlimited: boolean;
}) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-4">
        <FormField
          control={form.control}
          name="maxOrganizations"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={unlimited}
                  onCheckedChange={(checked) => {
                    if (checked === true) {
                      form.setValue("maxOrganizations", -1, { shouldValidate: true });
                    } else {
                      form.setValue("maxOrganizations", 1, { shouldValidate: true });
                    }
                  }}
                />
                <FormLabel className="mt-0! font-normal">Unlimited organizations (-1)</FormLabel>
              </div>
              {!unlimited ? (
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
          control={form.control}
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
        <FormField
          control={form.control}
          name="maxUsers"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Max users</FormLabel>
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
              <FormDescription>
                Staff user cap synced to Finance (accountants, managers).
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <FormField
        control={form.control}
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
        control={form.control}
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
    </>
  );
}
