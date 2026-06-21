"use client";

import { useMemo, useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Mail,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCw,
  LockOpen,
  Shield,
  Smartphone,
  Trash2,
  User as UserIcon,
} from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { PhoneInput } from "@/components/reui/phone-input";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  type PosStaff,
  posCreateStaff,
  posDeleteStaff,
  posListLocationsForStaff,
  posListStaff,
  posUnlockStaffPin,
  posUpdateStaff,
} from "@/lib/pos-staff-api";
import { fetchRbacConfig } from "@/lib/rbac-api";
import { type PosStaffFormData, posStaffFormSchema } from "@/lib/schemas/staff";
import { cn } from "@/lib/utils";

/** Radix Select forbids `value=""` on SelectItem; map this to API empty string. */
const PERMISSION_ROLE_STANDARD_VALUE = "__rbac_standard__";

const STAFF_TABLE_SKELETON_KEYS = ["sk-a", "sk-b", "sk-c", "sk-d", "sk-e"] as const;

const DEFAULT_STAFF_FORM: PosStaffFormData = {
  name: "",
  username: "",
  phone: "",
  email: "",
  pin: "",
  role: "waiter",
  permissionRole: PERMISSION_ROLE_STANDARD_VALUE,
  locationIds: [],
  primaryLocationId: "",
  isActive: true,
};

export default function StaffPage() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<PosStaff | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteBlockMessage, setDeleteBlockMessage] = useState<string | null>(null);
  const [pinResetTarget, setPinResetTarget] = useState<PosStaff | null>(null);
  const [resetPinValue, setResetPinValue] = useState("");
  const [isResetPinVisible, setIsResetPinVisible] = useState(false);
  /** Staff dialog only: mask new PIN by default; eye reveals digits. */
  const [isStaffPinVisible, setIsStaffPinVisible] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const form = useForm<PosStaffFormData>({
    resolver: zodResolver(posStaffFormSchema),
    defaultValues: DEFAULT_STAFF_FORM,
  });

  const { data: staffQueryData, isLoading: isLoadingStaff } = useQuery({
    queryKey: ["staff-list"],
    queryFn: posListStaff,
  });

  const staffList = staffQueryData?.staff ?? [];
  const staffLimits = staffQueryData?.limits;
  const atStaffCap = staffLimits != null && staffLimits.staffCount >= staffLimits.maxUsers;

  const sortedStaff = useMemo(() => {
    return [...staffList].sort((a, b) => {
      const aInactive = a.isActive === false ? 1 : 0;
      const bInactive = b.isActive === false ? 1 : 0;
      if (aInactive !== bInactive) return aInactive - bInactive;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
  }, [staffList]);

  const filteredStaff = useMemo(() => {
    const search = searchTerm.toLowerCase().trim();
    if (!search) return sortedStaff;
    return sortedStaff.filter(
      (s) =>
        s.name.toLowerCase().includes(search) ||
        s.username?.toLowerCase().includes(search) ||
        s.role?.toLowerCase().includes(search) ||
        s.email?.toLowerCase().includes(search) ||
        s.phone?.toLowerCase().includes(search),
    );
  }, [sortedStaff, searchTerm]);

  const { data: rbacConfig } = useQuery({
    queryKey: ["rbac-config"],
    queryFn: fetchRbacConfig,
  });
  const { data: locationOptions = [] } = useQuery({
    queryKey: ["staff-locations"],
    queryFn: posListLocationsForStaff,
  });

  const createMutation = useMutation({
    mutationFn: posCreateStaff,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-list"] });
      toast.success("Staff member created.");
      handleCloseDialog();
    },
    onError: (err: unknown) => {
      const isUsernameTaken =
        err &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code?: unknown }).code === "USERNAME_TAKEN";
      if (isUsernameTaken) {
        form.setError("username", {
          type: "server",
          message: "This username is already taken in this organization.",
        });
        return;
      }
      toast.error(err instanceof Error ? err.message : "Failed to create staff.");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => posUpdateStaff(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-list"] });
      toast.success("Staff member updated.");
      handleCloseDialog();
    },
    onError: (err: unknown) => {
      const isUsernameTaken =
        err &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code?: unknown }).code === "USERNAME_TAKEN";
      if (isUsernameTaken) {
        form.setError("username", {
          type: "server",
          message: "This username is already taken in this organization.",
        });
        return;
      }
      toast.error(err instanceof Error ? err.message : "Failed to update staff.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: posDeleteStaff,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-list"] });
      toast.success("Staff member removed.");
      setDeleteBlockMessage(null);
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Failed to remove staff.";
      if (message.includes("STAFF_DELETE_BLOCKED_REFERENCES") || message.includes("Deactivate")) {
        setDeleteBlockMessage(
          "Deletion blocked because this user has order/audit/payment history. Use Deactivate instead."
        );
      } else {
        setDeleteBlockMessage(null);
      }
      toast.error(message);
    },
  });

  const resetPinMutation = useMutation({
    mutationFn: ({ id, pin }: { id: string; pin: string }) => posUpdateStaff(id, { pin }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-list"] });
      toast.success("POS PIN reset successfully.");
      setPinResetTarget(null);
      setResetPinValue("");
      setIsResetPinVisible(false);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "Failed to reset PIN."),
  });

  const unlockPinMutation = useMutation({
    mutationFn: (id: string) => posUnlockStaffPin(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-list"] });
      toast.success("PIN lock cleared.");
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "Failed to unlock PIN."),
  });

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingStaff(null);
    setIsStaffPinVisible(false);
    form.reset(DEFAULT_STAFF_FORM);
  };

  const handleOpenDialog = (staff?: PosStaff) => {
    setIsStaffPinVisible(false);
    if (staff) {
      setEditingStaff(staff);
      form.reset({
        name: staff.name || "",
        username: staff.username || "",
        phone: staff.phone || "",
        email: staff.email || "",
        pin: "",
        role: (staff.role as PosStaffFormData["role"]) || "waiter",
        permissionRole: staff.permissionRole?.trim() ? staff.permissionRole : PERMISSION_ROLE_STANDARD_VALUE,
        locationIds: Array.isArray(staff.locations)
          ? staff.locations
              .map((entry) =>
                typeof entry === "string"
                  ? entry
                  : typeof entry?._id === "string"
                    ? entry._id
                    : ""
              )
              .filter((value) => value.length > 0)
          : [],
        primaryLocationId:
          typeof staff.location === "string"
            ? staff.location
            : typeof staff.location === "object" &&
                staff.location &&
                typeof staff.location._id === "string"
              ? staff.location._id
              : "",
        isActive: staff.isActive !== false,
      });
    } else {
      setEditingStaff(null);
      form.reset(DEFAULT_STAFF_FORM);
    }
    setIsDialogOpen(true);
  };

  const handleOpenPinResetDialog = (staff: PosStaff) => {
    setPinResetTarget(staff);
    setResetPinValue("");
    setIsResetPinVisible(false);
  };

  const generatePin = () => {
    const generatedPin = String(Math.floor(100_000 + Math.random() * 900_000));
    setResetPinValue(generatedPin);
  };

  const handleResetPin = () => {
    if (!pinResetTarget) return;
    const pin = resetPinValue.trim();
    if (!/^\d{4,6}$/.test(pin)) {
      toast.error("PIN must be 4 to 6 digits.");
      return;
    }
    resetPinMutation.mutate({ id: pinResetTarget._id, pin });
  };

  const onSubmit = (data: PosStaffFormData) => {
    const payload: Record<string, unknown> = {
      name: data.name.trim(),
      username: data.username.trim().toLowerCase(),
      role: data.role,
      status: data.isActive ? "active" : "suspended",
    };

    const phone = data.phone.trim();
    if (phone) payload.phone = phone;
    else payload.phone = "";

    const email = data.email.trim();
    if (email) payload.email = email;

    if (data.permissionRole === PERMISSION_ROLE_STANDARD_VALUE) {
      payload.permissionRole = "";
    } else if (data.permissionRole) {
      payload.permissionRole = data.permissionRole;
    }

    const pinTrim = data.pin.trim();
    if (pinTrim) {
      payload.pin = pinTrim;
    }
    const selectedLocationIds = Array.isArray(data.locationIds)
      ? [...new Set(data.locationIds.map((value) => String(value || "").trim()).filter(Boolean))]
      : [];
    payload.locationIds = selectedLocationIds;
    payload.primaryLocationId =
      selectedLocationIds.length > 0
        ? selectedLocationIds.includes(data.primaryLocationId || "")
          ? data.primaryLocationId
          : selectedLocationIds[0]
        : "";

    if (editingStaff) {
      updateMutation.mutate({ id: editingStaff._id, data: payload });
    } else {
      if (!pinTrim) {
        toast.error("PIN is required for new staff (4–6 digits).");
        return;
      }
      createMutation.mutate(payload);
    }
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    setDeleteBlockMessage(null);
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => setDeleteTarget(null),
    });
  };

  const deactivateDeleteTarget = () => {
    if (!deleteTarget) return;
    updateMutation.mutate(
      { id: deleteTarget.id, data: { status: "suspended" } },
      {
        onSuccess: () => {
          setDeleteTarget(null);
          setDeleteBlockMessage(null);
          toast.success("Staff member deactivated.");
        },
      }
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="font-bold text-3xl tracking-tight">Staff Management</h1>
          <p className="max-w-3xl text-muted-foreground text-sm leading-relaxed">
            Manage team members, roles, and POS access. PIN values are always hidden in the interface for security.
          </p>
          {staffLimits ? (
            <p className="text-muted-foreground text-sm">
              Plan staff slots:{" "}
              <span className="font-medium text-foreground tabular-nums">
                {staffLimits.staffCount} / {staffLimits.maxUsers}
              </span>
              {staffLimits.licenseEndsAt ? (
                <>
                  {" "}
                  · License ends{" "}
                  <span className="font-medium text-foreground">
                    {new Date(staffLimits.licenseEndsAt).toLocaleDateString()}
                  </span>
                </>
              ) : null}
            </p>
          ) : null}
        </div>
        <Button
          className="shrink-0"
          disabled={atStaffCap}
          title={
            atStaffCap
              ? "Staff limit reached for this tenant. Raise max users in the owner console or remove a user."
              : undefined
          }
          onClick={() => handleOpenDialog()}
        >
          <Plus className="mr-2 h-4 w-4" /> Add staff
        </Button>
      </div>

      <Card className="overflow-hidden border shadow-sm">
        <CardHeader className="border-b bg-muted/30 py-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-lg">Team roster</CardTitle>
              <CardDescription>
                Active accounts first; use Edit to suspend access without deleting the profile.
              </CardDescription>
            </div>
            <div className="relative w-full max-w-xs">
              <Input
                placeholder="Search staff..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-9 pl-9 text-sm"
              />
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground">
                <svg
                  className="h-4 w-4"
                  fill="none"
                  height="24"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  width="24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-b hover:bg-transparent">
                <TableHead className="h-11 w-[min(28%,220px)] pl-6 font-semibold">Staff</TableHead>
                <TableHead className="h-11 font-semibold">Role</TableHead>
                <TableHead className="h-11 font-semibold">Contact</TableHead>
                <TableHead className="h-11 font-semibold">POS PIN</TableHead>
                <TableHead className="h-11 font-semibold">Status</TableHead>
                <TableHead className="h-11 pr-6 text-right font-semibold">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingStaff ? (
                STAFF_TABLE_SKELETON_KEYS.map((rowKey) => (
                  <TableRow key={rowKey} className="hover:bg-transparent">
                    <TableCell className="pl-6">
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-9 w-9 rounded-full" />
                        <div className="space-y-1">
                          <Skeleton className="h-4 w-[120px]" />
                          <Skeleton className="h-3 w-[80px]" />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-[100px]" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-[100px]" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-[56px]" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-[60px]" />
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      <Skeleton className="ml-auto h-8 w-10" />
                    </TableCell>
                  </TableRow>
                ))
              ) : filteredStaff.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="h-28 text-center text-muted-foreground">
                    {searchTerm ? "No staff members matching your search." : "No staff members yet."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredStaff.map((staff) => {
                  const active = staff.isActive !== false;
                  const isPinLocked =
                    typeof staff.pinLockedUntil === "string" &&
                    staff.pinLockedUntil.length > 0 &&
                    new Date(staff.pinLockedUntil).getTime() > Date.now();
                  return (
                    <TableRow
                      key={staff._id}
                      className={cn("border-b transition-colors last:border-0", "hover:bg-muted/40")}
                    >
                      <TableCell className="py-3 pl-6 align-middle">
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border",
                              active ? "bg-background" : "bg-muted text-muted-foreground",
                            )}
                          >
                            <UserIcon className="h-4 w-4 opacity-80" />
                          </div>
                          <div className="flex min-w-0 flex-col">
                            <span className="truncate font-medium">{staff.name}</span>
                            <span className="text-muted-foreground text-xs">{staff.username || "No username set"}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="align-middle">
                        <div className="flex items-center gap-1.5 text-sm capitalize">
                          <Shield className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          {staff.role}
                        </div>
                      </TableCell>
                      <TableCell className="align-middle">
                        <div className="flex max-w-[220px] flex-col gap-0.5 text-sm">
                          {staff.email ? (
                            <div className="flex items-start gap-1.5">
                              <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              <span className="break-all leading-snug">{staff.email}</span>
                            </div>
                          ) : null}
                          {staff.phone ? (
                            <div className="flex items-center gap-1.5">
                              <Smartphone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              <span className="tabular-nums">{staff.phone}</span>
                            </div>
                          ) : null}
                          {!staff.email && !staff.phone ? (
                            <span className="text-muted-foreground text-xs">—</span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="align-middle">
                        <div className="flex max-w-56 flex-col gap-0.5">
                          <div className="flex items-center gap-1.5 font-medium text-sm">
                            <KeyRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            {staff.hasLoginPin ? (
                              <span className="text-xs">Configured</span>
                            ) : (
                              <span className="text-muted-foreground text-xs">Not configured</span>
                            )}
                          </div>
                          <span className="pl-5 text-[11px] text-muted-foreground leading-snug">Hidden for security.</span>
                          <div className="pt-1 pl-5">
                            <div className="flex flex-wrap gap-1.5">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => handleOpenPinResetDialog(staff)}
                              >
                                Reset PIN
                              </Button>
                              {isPinLocked ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs"
                                  disabled={unlockPinMutation.isPending}
                                  onClick={() => unlockPinMutation.mutate(staff._id)}
                                >
                                  Unlock
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="align-middle">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge
                            variant={active ? "default" : "secondary"}
                            className={cn("font-normal", !active && "text-muted-foreground")}
                          >
                            {active ? "Active" : "Inactive"}
                          </Badge>
                          {isPinLocked ? (
                            <Badge variant="outline" className="font-normal">
                              PIN locked
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="pr-6 text-right align-middle">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label={`Actions for ${staff.name}`}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={() => handleOpenDialog(staff)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleOpenPinResetDialog(staff)}>
                              <RotateCw className="mr-2 h-4 w-4" />
                              Reset PIN
                            </DropdownMenuItem>
                            {isPinLocked ? (
                              <DropdownMenuItem
                                disabled={unlockPinMutation.isPending}
                                onClick={() => unlockPinMutation.mutate(staff._id)}
                              >
                                <LockOpen className="mr-2 h-4 w-4" />
                                Unlock PIN
                              </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => setDeleteTarget({ id: staff._id, name: staff.name })}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Remove
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          if (open) setIsDialogOpen(true);
          else handleCloseDialog();
        }}
      >
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{editingStaff ? "Edit Staff Member" : "Add Staff Member"}</DialogTitle>
            <DialogDescription>
              Floor PIN is 4-6 digits for POS login. When editing, leave PIN blank to keep the existing PIN.
            </DialogDescription>
          </DialogHeader>
          <form
            key={editingStaff?._id ?? "new"}
            autoComplete="off"
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4 py-4"
          >
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="staff-full-name">Full name</Label>
                <Input
                  id="staff-full-name"
                  autoComplete="name"
                  {...form.register("name")}
                  placeholder="e.g. Jane Doe"
                />
                {form.formState.errors.name && (
                  <p className="text-destructive text-sm">{form.formState.errors.name.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="staff-username">Username</Label>
                <Input
                  id="staff-username"
                  autoComplete="off"
                  {...form.register("username")}
                  placeholder="e.g. john_waiter"
                />
                <p className="text-muted-foreground text-xs">
                  Used to identify this staff member on orders.
                </p>
                {editingStaff ? (
                  <p className="text-muted-foreground text-xs">
                    Changing username only affects future orders.
                  </p>
                ) : null}
                {form.formState.errors.username && (
                  <p className="text-destructive text-sm">
                    {form.formState.errors.username.message}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="staff-email">Work email (optional)</Label>
                  <Input
                    id="staff-email"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    {...form.register("email")}
                    placeholder="name@company.com"
                  />
                  {form.formState.errors.email && (
                    <p className="text-destructive text-sm">{form.formState.errors.email.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="staff-phone">Mobile phone (optional)</Label>
                  <Controller
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <PhoneInput
                        id="staff-phone"
                        autoComplete="tel"
                        placeholder="Enter phone number"
                        value={field.value || undefined}
                        onChange={(v) => field.onChange(v ?? "")}
                      />
                    )}
                  />
                </div>
              </div>

              <div className="space-y-3 rounded-md border p-3">
                <div>
                  <Label>Assigned branches</Label>
                  <p className="text-muted-foreground text-xs">Select one or more branches this staff member can access.</p>
                </div>
                <Controller
                  control={form.control}
                  name="locationIds"
                  render={({ field }) => {
                    const selected = Array.isArray(field.value) ? field.value : [];
                    return (
                      <div className="space-y-2">
                        {locationOptions.length === 0 ? (
                          <p className="text-muted-foreground text-xs">No branches found.</p>
                        ) : (
                          locationOptions.map((location) => {
                            const checked = selected.includes(location._id);
                            return (
                              <div key={location._id} className="flex items-center justify-between rounded border px-3 py-2">
                                <span className="text-sm">{location.name || location.code || location._id}</span>
                                <Switch
                                  checked={checked}
                                  onCheckedChange={(nextChecked) => {
                                    const next = nextChecked
                                      ? [...selected, location._id]
                                      : selected.filter((id) => id !== location._id);
                                    field.onChange([...new Set(next)]);
                                  }}
                                />
                              </div>
                            );
                          })
                        )}
                      </div>
                    );
                  }}
                />
                <Controller
                  control={form.control}
                  name="primaryLocationId"
                  render={({ field }) => {
                    const selectedLocationIds = Array.isArray(form.watch("locationIds")) ? form.watch("locationIds") : [];
                    return (
                      <div className="space-y-2">
                        <Label htmlFor="staff-primary-location">Primary branch</Label>
                        <Select
                          value={field.value || "__none__"}
                          onValueChange={(value) => field.onChange(value === "__none__" ? "" : value)}
                        >
                          <SelectTrigger id="staff-primary-location">
                            <SelectValue placeholder="Select primary branch" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">No primary branch</SelectItem>
                            {(selectedLocationIds ?? []).map((id) => {
                              const location = locationOptions.find((entry) => entry._id === id);
                              return (
                                <SelectItem key={id} value={id}>
                                  {location?.name || location?.code || id}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  }}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="staff-pin">
                  {editingStaff ? "New POS PIN (optional)" : "POS sign-in PIN (4–6 digits)"}
                </Label>
                <Controller
                  control={form.control}
                  name="pin"
                  render={({ field }) => (
                    <div className="relative">
                      <Input
                        id="staff-pin"
                        type={isStaffPinVisible ? "text" : "password"}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        autoComplete="new-password"
                        maxLength={6}
                        placeholder={editingStaff ? "Leave blank to keep current PIN" : "e.g. 1001"}
                        className="pr-10 font-mono text-base tabular-nums tracking-widest"
                        value={field.value}
                        onChange={(e) => {
                          const digits = e.target.value.replace(/\D/g, "").slice(0, 6);
                          field.onChange(digits);
                        }}
                        onBlur={field.onBlur}
                        name={field.name}
                        ref={field.ref}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute top-1/2 right-1 h-8 w-8 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-pressed={isStaffPinVisible}
                        aria-label={isStaffPinVisible ? "Hide PIN" : "Show PIN"}
                        onClick={() => setIsStaffPinVisible((v) => !v)}
                      >
                        {isStaffPinVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  )}
                />
                {form.formState.errors.pin && (
                  <p className="text-destructive text-sm">{form.formState.errors.pin.message}</p>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="srole">Departmental role</Label>
                  <Controller
                    control={form.control}
                    name="role"
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger id="srole">
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                          <SelectItem value="waiter">Waiter</SelectItem>
                          <SelectItem value="kitchen">Kitchen</SelectItem>
                          <SelectItem value="cashier">Cashier</SelectItem>
                          <SelectItem value="hostess">Hostess</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sperm">RBAC permission set</Label>
                  <Controller
                    control={form.control}
                    name="permissionRole"
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger id="sperm">
                          <SelectValue placeholder="Standard" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={PERMISSION_ROLE_STANDARD_VALUE}>Standard (Role-based)</SelectItem>
                          {(rbacConfig?.data?.customRoles ?? [])
                            .filter((role: { key?: string }) => String(role.key ?? "").trim() !== "")
                            .map((role: { key: string; label?: string }) => (
                              <SelectItem key={role.key} value={role.key}>
                                {role.label || role.key}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <Controller
                  control={form.control}
                  name="isActive"
                  render={({ field }) => <Switch id="sactive" checked={field.value} onCheckedChange={field.onChange} />}
                />
                <Label htmlFor="sactive">Active account (allowed to sign in)</Label>
              </div>
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={handleCloseDialog}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {(createMutation.isPending || updateMutation.isPending) && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {editingStaff ? "Save changes" : "Register staff"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(pinResetTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setPinResetTarget(null);
            setResetPinValue("");
            setIsResetPinVisible(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset POS PIN</DialogTitle>
            <DialogDescription>
              {pinResetTarget ? `Set a new 4-6 digit PIN for ${pinResetTarget.name}.` : null}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label htmlFor="reset-staff-pin">New POS PIN</Label>
              <div className="relative">
                <Input
                  id="reset-staff-pin"
                  type={isResetPinVisible ? "text" : "password"}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="new-password"
                  maxLength={6}
                  placeholder="Enter 4-6 digits"
                  className="pr-10 font-mono text-base tabular-nums tracking-widest"
                  value={resetPinValue}
                  onChange={(e) => setResetPinValue(e.target.value.replace(/\D/g, "").slice(0, 6))}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute top-1/2 right-1 h-8 w-8 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-pressed={isResetPinVisible}
                  aria-label={isResetPinVisible ? "Hide PIN" : "Show PIN"}
                  onClick={() => setIsResetPinVisible((value) => !value)}
                >
                  {isResetPinVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <Button type="button" variant="outline" size="sm" className="h-8" onClick={generatePin}>
              Generate PIN
            </Button>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setPinResetTarget(null);
                setResetPinValue("");
                setIsResetPinVisible(false);
              }}
            >
              Cancel
            </Button>
            <Button type="button" disabled={resetPinMutation.isPending} onClick={handleResetPin}>
              {resetPinMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Reset PIN
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setDeleteBlockMessage(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove staff member?</DialogTitle>
            <DialogDescription>
              {deleteTarget
                ? `Permanently remove ${deleteTarget.name} from this organization. Their PIN will no longer sign in to the POS.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            {deleteBlockMessage ? (
              <p className="w-full rounded-md border border-amber-500/50 bg-amber-500/10 p-2 text-amber-200 text-xs">
                {deleteBlockMessage}
              </p>
            ) : null}
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="border-emerald-500/50 text-emerald-300"
              disabled={updateMutation.isPending || !deleteTarget}
              onClick={deactivateDeleteTarget}
            >
              Deactivate Instead
            </Button>
            <Button type="button" variant="destructive" disabled={deleteMutation.isPending} onClick={confirmDelete}>
              {deleteMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
