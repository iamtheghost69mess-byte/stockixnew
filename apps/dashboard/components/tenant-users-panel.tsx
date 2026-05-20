"use client";

import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  KeyRound,
  Loader2,
  MoreHorizontal,
  Plus,
  Trash2,
  UserCheck,
  UserMinus,
  Users,
} from "lucide-react";
import { toast } from "@/components/reusabletoast";

import { useMe } from "@/hooks/use-me";
import { formatApiError } from "@/lib/api-errors";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const FINANCE_ROLES = [
  { id: 1, label: "Admin" },
  { id: 2, label: "Staff" },
] as const;

type FinanceUserRow = {
  userId: number;
  email: string;
  firstName: string;
  lastName: string;
  roleName: string | null;
  isActive: boolean;
};

const createUserSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1).max(255),
  lastName: z.string().min(1).max(255),
  password: z.string().min(8).max(256),
  roleId: z.coerce.number().int().positive(),
});

const editUserSchema = z.object({
  firstName: z.string().min(1).max(255),
  lastName: z.string().min(1).max(255),
  roleId: z.coerce.number().int().positive(),
});

const resetPasswordSchema = z.object({
  newPassword: z.string().min(8).max(256),
});

type CreateUserValues = z.infer<typeof createUserSchema>;
type EditUserValues = z.infer<typeof editUserSchema>;
type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

type Props = {
  tenantId: string;
  financeLinked: boolean;
};

export default function TenantUsersPanel({ tenantId, financeLinked }: Props) {
  const me = useMe();
  const canMutate = Boolean(me?.capabilities.canManageTenants);

  const [users, setUsers] = useState<FinanceUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const [editTarget, setEditTarget] = useState<FinanceUserRow | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const [resetTarget, setResetTarget] = useState<FinanceUserRow | null>(null);
  const [resetSaving, setResetSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<FinanceUserRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [actionUserId, setActionUserId] = useState<number | null>(null);

  const createForm = useForm<CreateUserValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      email: "",
      firstName: "",
      lastName: "",
      password: "",
      roleId: 2,
    },
  });

  const editForm = useForm<EditUserValues>({
    resolver: zodResolver(editUserSchema),
    defaultValues: { firstName: "", lastName: "", roleId: 2 },
  });

  const resetForm = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { newPassword: "" },
  });

  const load = useCallback(async () => {
    if (!financeLinked) {
      setLoading(false);
      setUsers([]);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/users`);
      const body = await readJson(res);
      if (!res.ok) {
        setLoadError(formatApiError(body, "Could not load finance users."));
        setUsers([]);
        return;
      }
      const data = body as { users?: FinanceUserRow[] };
      setUsers(data.users ?? []);
    } finally {
      setLoading(false);
    }
  }, [tenantId, financeLinked]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!editTarget) return;
    editForm.reset({
      firstName: editTarget.firstName,
      lastName: editTarget.lastName,
      roleId: editTarget.roleName?.toLowerCase().includes("admin") ? 1 : 2,
    });
  }, [editTarget, editForm]);

  const onCreate = async (values: CreateUserValues) => {
    setCreating(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const body = await readJson(res);
      if (!res.ok) {
        toast.error(formatApiError(body, "Could not create user."));
        return;
      }
      toast.success("User created");
      setCreateOpen(false);
      createForm.reset();
      await load();
    } finally {
      setCreating(false);
    }
  };

  const onEdit = async (values: EditUserValues) => {
    if (!editTarget) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/users/${editTarget.userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const body = await readJson(res);
      if (!res.ok) {
        toast.error(formatApiError(body, "Could not update user."));
        return;
      }
      toast.success("User updated");
      setEditTarget(null);
      await load();
    } finally {
      setEditSaving(false);
    }
  };

  const onResetPassword = async (values: ResetPasswordValues) => {
    if (!resetTarget) return;
    setResetSaving(true);
    try {
      const res = await fetch(
        `/api/tenants/${tenantId}/users/${resetTarget.userId}/reset-password`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        },
      );
      const body = await readJson(res);
      if (!res.ok) {
        toast.error(formatApiError(body, "Could not reset password."));
        return;
      }
      toast.success("Password updated");
      setResetTarget(null);
      resetForm.reset();
    } finally {
      setResetSaving(false);
    }
  };

  const onDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/users/${deleteTarget.userId}`, {
        method: "DELETE",
      });
      const body = await readJson(res);
      if (!res.ok) {
        toast.error(formatApiError(body, "Could not remove user."));
        return;
      }
      toast.success("User removed from tenant");
      setDeleteTarget(null);
      await load();
    } finally {
      setDeleting(false);
    }
  };

  const toggleActive = async (user: FinanceUserRow, activate: boolean) => {
    setActionUserId(user.userId);
    try {
      const path = activate ? "activate" : "suspend";
      const res = await fetch(`/api/tenants/${tenantId}/users/${user.userId}/${path}`, {
        method: "POST",
      });
      const body = await readJson(res);
      if (!res.ok) {
        toast.error(formatApiError(body, activate ? "Could not activate user." : "Could not suspend user."));
        return;
      }
      toast.success(activate ? "User activated" : "User suspended");
      await load();
    } finally {
      setActionUserId(null);
    }
  };

  if (!financeLinked) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            Finance users
          </CardTitle>
          <CardDescription>
            User management is available after the tenant is provisioned and linked to a finance
            deployment (internal port and finance tenant id).
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4" />
              Finance users
            </CardTitle>
            <CardDescription>
              Manage users in this tenant&apos;s Bigcapital stack. Uses tenant database user ids for
              edits (not system user ids from create response).
            </CardDescription>
          </div>
          {canMutate ? (
            <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1 h-4 w-4" />
              Add user
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading users…
            </div>
          ) : loadError ? (
            <p className="text-sm text-destructive">{loadError}</p>
          ) : users.length === 0 ? (
            <p className="text-sm text-muted-foreground">No users in this finance tenant yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.userId}>
                    <TableCell>
                      {user.firstName} {user.lastName}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{user.email}</TableCell>
                    <TableCell>{user.roleName ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={user.isActive ? "secondary" : "outline"}>
                        {user.isActive ? "Active" : "Suspended"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label="User actions"
                            />
                          }
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {canMutate ? (
                            <>
                              <DropdownMenuItem onClick={() => setEditTarget(user)}>
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setResetTarget(user)}>
                                <KeyRound className="mr-2 h-4 w-4" />
                                Reset password
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {user.isActive ? (
                                <DropdownMenuItem
                                  disabled={actionUserId === user.userId}
                                  onClick={() => void toggleActive(user, false)}
                                >
                                  <UserMinus className="mr-2 h-4 w-4" />
                                  Suspend
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  disabled={actionUserId === user.userId}
                                  onClick={() => void toggleActive(user, true)}
                                >
                                  <UserCheck className="mr-2 h-4 w-4" />
                                  Activate
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setDeleteTarget(user)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Remove
                              </DropdownMenuItem>
                            </>
                          ) : (
                            <DropdownMenuItem disabled>Read-only access</DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add finance user</DialogTitle>
            <DialogDescription>
              Creates a user in the finance tenant database and links them to this organization.
            </DialogDescription>
          </DialogHeader>
          <Form {...createForm}>
            <form onSubmit={createForm.handleSubmit(onCreate)} className="space-y-4">
              <FormField
                control={createForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={createForm.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createForm.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={createForm.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="new-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={createForm.control}
                name="roleId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role</FormLabel>
                    <Select
                      value={String(field.value)}
                      onValueChange={(v) => field.onChange(Number(v))}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {FINANCE_ROLES.map((r) => (
                          <SelectItem key={r.id} value={String(r.id)}>
                            {r.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={creating}>
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit user</DialogTitle>
            <DialogDescription>{editTarget?.email}</DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEdit)} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={editForm.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={editForm.control}
                name="roleId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role</FormLabel>
                    <Select
                      value={String(field.value)}
                      onValueChange={(v) => field.onChange(Number(v))}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {FINANCE_ROLES.map((r) => (
                          <SelectItem key={r.id} value={String(r.id)}>
                            {r.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditTarget(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={editSaving}>
                  {editSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resetTarget} onOpenChange={(open) => !open && setResetTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>
              Set a new password for {resetTarget?.email}. No email is sent.
            </DialogDescription>
          </DialogHeader>
          <Form {...resetForm}>
            <form onSubmit={resetForm.handleSubmit(onResetPassword)} className="space-y-4">
              <FormField
                control={resetForm.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New password</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="new-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setResetTarget(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={resetSaving}>
                  {resetSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update password"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove user from tenant?</AlertDialogTitle>
            <AlertDialogDescription>
              Removes {deleteTarget?.email} from this finance tenant. If they have no other
              tenants, the system user may be soft-deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                void onDelete();
              }}
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
