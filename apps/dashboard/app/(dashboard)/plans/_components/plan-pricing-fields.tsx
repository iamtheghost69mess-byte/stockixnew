"use client";

import type { UseFormReturn } from "react-hook-form";

import { Checkbox } from "@/components/ui/checkbox";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { PlanValues } from "@/lib/schemas";

export function PlanPricingFields({ form }: { form: UseFormReturn<PlanValues> }) {
  return (
    <div className="space-y-4 rounded-lg border border-border/80 p-4">
      <p className="text-sm font-medium">Pricing (optional)</p>
      <FormField
        control={form.control}
        name="priceMonthly"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Monthly price (cents, e.g. 2900 = $29.00)</FormLabel>
            <FormControl>
              <Input
                type="number"
                min={0}
                className="w-full max-w-xs"
                value={field.value ?? ""}
                onChange={(e) =>
                  field.onChange(e.target.value === "" ? undefined : Number(e.target.value))
                }
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="priceAnnually"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Annual price (cents)</FormLabel>
            <FormControl>
              <Input
                type="number"
                min={0}
                className="w-full max-w-xs"
                value={field.value ?? ""}
                onChange={(e) =>
                  field.onChange(e.target.value === "" ? undefined : Number(e.target.value))
                }
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="currency"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Currency (ISO 4217)</FormLabel>
            <FormControl>
              <Input {...field} value={field.value ?? "USD"} maxLength={3} className="w-28 font-mono uppercase" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="billingInterval"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Billing interval</FormLabel>
            <Select
              value={field.value ?? "none"}
              onValueChange={(v) => field.onChange(v === "none" ? undefined : v)}
            >
              <FormControl>
                <SelectTrigger className="w-full max-w-xs">
                  <SelectValue placeholder="— not set —" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="none">— not set —</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="annually">Annually</SelectItem>
                <SelectItem value="one_time">One time</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="featuresText"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Features (one per line)</FormLabel>
            <FormControl>
              <Textarea {...field} value={field.value ?? ""} rows={4} className="resize-none" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="isPublic"
        render={({ field }) => (
          <FormItem className="flex flex-row items-center gap-2 space-y-0">
            <FormControl>
              <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
            </FormControl>
            <FormLabel className="mt-0! font-normal">Show on public pricing page</FormLabel>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
