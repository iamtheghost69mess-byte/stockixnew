"use client";

import { useEffect, useState } from "react";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ACCOUNT_TYPES, type PosAccount, posCreateAccount, posUpdateAccount } from "@/lib/pos-accounting-api";
import { accountCreateFormSchema, accountEditFormSchema } from "@/lib/schemas/accounting/account-form";
import { fieldErrorsFromZodError } from "@/lib/schemas/accounting/zod-field-errors";

type Mode = "create" | "edit";

function FieldMessage({ message }: Readonly<{ message?: string }>) {
  if (!message) return null;
  return <p className="text-destructive text-sm">{message}</p>;
}

export function AccountFormDialog({
  open,
  onOpenChange,
  mode,
  account,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: Mode;
  account?: PosAccount | null;
}>) {
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("asset");
  const [isActive, setIsActive] = useState(true);
  const [sortOrder, setSortOrder] = useState("0");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) {
      setFieldErrors({});
      return;
    }
    setFieldErrors({});
    if (mode === "edit" && account) {
      setCode(account.code);
      setName(account.name);
      setType(account.type);
      setIsActive(account.isActive !== false);
      setSortOrder(String(account.sortOrder ?? 0));
    } else {
      setCode("");
      setName("");
      setType("asset");
      setIsActive(true);
      setSortOrder("0");
    }
  }, [open, mode, account]);

  const createMut = useMutation({
    mutationFn: () =>
      posCreateAccount({
        code: code.trim(),
        name: name.trim(),
        type,
        isActive,
        sortOrder: Number(sortOrder) || 0,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounting", "accounts"] });
      toast.success("Account created.");
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create account."),
  });

  const updateMut = useMutation({
    mutationFn: () => {
      if (!account?._id) throw new Error("Missing account");
      return posUpdateAccount(account._id, {
        name: name.trim(),
        type,
        isActive,
        sortOrder: Number(sortOrder) || 0,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounting", "accounts"] });
      toast.success("Account updated.");
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update account."),
  });

  const onSubmit = () => {
    if (mode === "create") {
      const parsed = accountCreateFormSchema.safeParse({ name, code, type, isActive, sortOrder });
      if (!parsed.success) {
        setFieldErrors(fieldErrorsFromZodError(parsed.error));
        return;
      }
      setFieldErrors({});
      createMut.mutate();
      return;
    }
    const parsed = accountEditFormSchema.safeParse({ name, type, isActive, sortOrder });
    if (!parsed.success) {
      setFieldErrors(fieldErrorsFromZodError(parsed.error));
      return;
    }
    setFieldErrors({});
    updateMut.mutate();
  };

  const busy = createMut.isPending || updateMut.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "New account" : "Edit account"}</DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Add a code unique within your organization."
              : "Code cannot be changed. Update name, type, or status."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 py-2">
          <div className="grid gap-2">
            <Label htmlFor="acc-code">Code</Label>
            <Input
              id="acc-code"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setFieldErrors((prev) => ({ ...prev, code: "" }));
              }}
              disabled={mode === "edit" || busy}
              className="font-mono"
            />
            <FieldMessage message={fieldErrors.code} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="acc-name">Name</Label>
            <Input
              id="acc-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setFieldErrors((er) => ({ ...er, name: "" }));
              }}
              disabled={busy}
            />
            <FieldMessage message={fieldErrors.name} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
            <div className="grid w-full min-w-0 gap-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={setType} disabled={busy}>
                <SelectTrigger className="h-10 w-full min-w-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize">
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid w-full min-w-0 gap-2">
              <Label htmlFor="acc-sort">Sort order</Label>
              <Input
                id="acc-sort"
                type="number"
                value={sortOrder}
                onChange={(e) => {
                  setSortOrder(e.target.value);
                  setFieldErrors((er) => ({ ...er, sortOrder: "" }));
                }}
                disabled={busy}
                className="h-10 w-full"
              />
              <FieldMessage message={fieldErrors.sortOrder} />
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3">
            <Label htmlFor="acc-active">Active</Label>
            <Switch id="acc-active" checked={isActive} onCheckedChange={setIsActive} disabled={busy} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={onSubmit} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : mode === "create" ? "Create" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
