"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import type { UseFormReturn } from "react-hook-form";

import type { InviteOwnerValues } from "@/lib/schemas";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
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

export type PlatformRoleOption = {
  id: string;
  name: string;
  slug: string;
};

export type OwnerInviteDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inviteForm: UseFormReturn<InviteOwnerValues>;
  onSubmit: (e?: React.BaseSyntheticEvent) => Promise<void>;
  adding: boolean;
  onCancel: () => void;
};

export function OwnerInviteDialog({
  open,
  onOpenChange,
  inviteForm,
  onSubmit,
  adding,
  onCancel,
}: OwnerInviteDialogProps) {
  const [roles, setRoles] = useState<PlatformRoleOption[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      setRolesLoading(true);
      try {
        const res = await fetch("/api/admin/roles");
        const data = (await res.json()) as {
          roles?: PlatformRoleOption[];
          error?: string;
        };
        if (!cancelled && res.ok && data.roles?.length) {
          setRoles(data.roles);
          const current = inviteForm.getValues("roleId");
          if (!current && data.roles[0]) {
            inviteForm.setValue("roleId", data.roles[0].id);
          }
        }
      } finally {
        if (!cancelled) setRolesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, inviteForm]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite team member</DialogTitle>
          <DialogDescription>
            Send an invitation to a new owner. They will receive an email to set up their account.
          </DialogDescription>
        </DialogHeader>
        <Form {...inviteForm}>
          <form
            id="owners-invite-form"
            onSubmit={(e) => void onSubmit(e)}
            className="grid gap-4"
            noValidate
          >
            <FormField
              control={inviteForm.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-medium text-muted-foreground">
                    Email
                  </FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="owner@example.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={inviteForm.control}
              name="roleId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-medium text-muted-foreground">
                    Role
                  </FormLabel>
                  <Select
                    value={field.value ?? ""}
                    onValueChange={(value) => field.onChange(value)}
                    disabled={rolesLoading || roles.length === 0}
                  >
                    <FormControl>
                      <SelectTrigger className="h-9 w-full">
                        <SelectValue
                          placeholder={rolesLoading ? "Loading roles…" : "Select role"}
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {roles.map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          {role.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={inviteForm.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-medium text-muted-foreground">
                    Name
                  </FormLabel>
                  <FormControl>
                    <Input type="text" placeholder="Full name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" form="owners-invite-form" disabled={adding} className="gap-2">
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Send invite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
