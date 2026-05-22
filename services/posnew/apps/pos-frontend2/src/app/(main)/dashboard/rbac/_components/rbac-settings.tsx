"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import Link from "next/link";

import type { ColumnDef, SortingState } from "@tanstack/react-table";
import { HelpCircle } from "lucide-react";
import { toast } from "sonner";

import { DataTable } from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  fetchRbacCatalog,
  fetchRbacConfig,
  putRbacConfig,
  type RbacCatalogPayload,
  type RbacConfigPayload,
} from "@/lib/rbac-api";
import {
  applyMatrixCellToggle,
  buildRbacMatrixRowCellRuns,
  matrixActionLabels,
  matrixCellChecked,
  rbacMatrixRunSummary,
  RBAC_MATRIX_ACTIONS,
  RBAC_MATRIX_ROWS,
  type RbacMatrixAction,
  type RbacMatrixRow,
} from "@/lib/rbac-matrix";
import {
  BUILTIN_GROUP_LABELS,
  expandCanToIdSet,
  idSetsEqual,
  idSetToCanArray,
  mergeBuiltinEffective,
  permissionAccessType,
  type RbacPermissionRow,
} from "@/lib/rbac-ui";
import { usePosAuthStore } from "@/stores/pos-auth-store";

const EDITABLE_BUILTIN = ["manager", "waiter", "cashier", "kitchen", "hostess"] as const;

/** Built-in parents for custom-role inheritance (includes accounting templates; not all are staff login roles). */
const INHERIT_PARENT_OPTIONS = [...EDITABLE_BUILTIN, "accountant", "accountant_readonly", "admin"] as const;

const ROLE_DESCRIPTIONS: Record<string, string> = {
  admin: "Full system access. Required by the server — not editable.",
  manager: "Floor operations, all orders, payments, kitchen, and full back office.",
  waiter: "Tables, menu, own orders — no payments, kitchen queue, or back office.",
  cashier: "Like waiter, plus taking payments.",
  kitchen: "Kitchen display queue only.",
  hostess: "Tables and menu read-only — no orders or payments.",
};

function inheritParentLabel(key: string): string {
  switch (key) {
    case "admin":
      return "Admin (full access)";
    case "accountant":
      return "Accountant template (GL)";
    case "accountant_readonly":
      return "Accountant template (read-only)";
    default:
      return key.charAt(0).toUpperCase() + key.slice(1);
  }
}

function matrixCellCheckedCustom(
  row: RbacMatrixRow,
  action: RbacMatrixAction,
  inherited: ReadonlySet<string>,
  extra: ReadonlySet<string>,
): boolean {
  const ids = row.actions[action];
  if (!ids || ids.length === 0) return false;
  return ids.every((id) => inherited.has(id) || extra.has(id));
}

function matrixCellFullyInherited(
  row: RbacMatrixRow,
  action: RbacMatrixAction,
  inherited: ReadonlySet<string>,
): boolean {
  const ids = row.actions[action];
  if (!ids || ids.length === 0) return false;
  return ids.every((id) => inherited.has(id));
}

function toggleMatrixCellCustom(
  row: RbacMatrixRow,
  action: RbacMatrixAction,
  checked: boolean,
  inherited: ReadonlySet<string>,
  extra: Set<string>,
): void {
  const ids = row.actions[action];
  if (!ids || ids.length === 0) return;
  if (checked) {
    for (const id of ids) {
      if (!inherited.has(id)) extra.add(id);
    }
  } else {
    for (const id of ids) {
      if (!inherited.has(id)) extra.delete(id);
    }
  }
}

function emptyGrants(): Record<(typeof EDITABLE_BUILTIN)[number], Set<string>> {
  return {
    manager: new Set(),
    waiter: new Set(),
    cashier: new Set(),
    kitchen: new Set(),
    hostess: new Set(),
  };
}

type CustomRow = {
  key: string;
  label: string;
  inheritsFrom: string;
  extraCan: Set<string>;
};

type CustomRoleTableRow = CustomRow & { rowIndex: number };

export function RbacSettings() {
  const [catalog, setCatalog] = useState<RbacCatalogPayload | null>(null);
  const [config, setConfig] = useState<RbacConfigPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchMe = usePosAuthStore((s) => s.fetchMe);

  const permissions = catalog?.permissions;
  const defaults = useMemo(
    () => (catalog?.defaults && typeof catalog.defaults === "object" ? catalog.defaults : {}),
    [catalog?.defaults],
  );

  const catalogIds = useMemo(
    () => (Array.isArray(permissions) ? permissions : []).filter((p) => p.id !== "*").map((p) => p.id),
    [permissions],
  );

  const [roleGrants, setRoleGrants] = useState(() => emptyGrants());
  const [selectedBuiltin, setSelectedBuiltin] = useState<(typeof EDITABLE_BUILTIN)[number]>("manager");
  const [customRows, setCustomRows] = useState<CustomRow[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [formKey, setFormKey] = useState("");
  const [formLabel, setFormLabel] = useState("");
  const [formInherits, setFormInherits] = useState("");
  const [formExtra, setFormExtra] = useState(() => new Set<string>());

  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogPageIndex, setCatalogPageIndex] = useState(0);
  const [catalogPageSize, setCatalogPageSize] = useState(20);
  const [catalogSorting, setCatalogSorting] = useState<SortingState>([]);

  const [customRolesPageIndex, setCustomRolesPageIndex] = useState(0);
  const [customRolesPageSize] = useState(20);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [catRes, cfgRes] = await Promise.all([fetchRbacCatalog(), fetchRbacConfig()]);
      setCatalog(catRes.data ?? null);
      setConfig(cfgRes.data ?? null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
      setCatalog(null);
      setConfig(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!catalogIds.length || !Object.keys(defaults).length) return;
    const overrides = config?.builtinOverrides ?? {};
    const next = emptyGrants();
    for (const r of EDITABLE_BUILTIN) {
      const can = mergeBuiltinEffective(defaults, overrides, r);
      next[r] = expandCanToIdSet(can, catalogIds);
    }
    setRoleGrants(next);
    const cr = config?.customRoles ?? [];
    setCustomRows(
      cr.map((row) => ({
        key: String(row.key || "").toLowerCase(),
        label: row.label || row.key,
        inheritsFrom: row.inheritsFrom ? String(row.inheritsFrom).toLowerCase() : "",
        extraCan: expandCanToIdSet(row.can ?? [], catalogIds),
      })),
    );
  }, [config, defaults, catalogIds]);

  const togglePerm = useCallback((role: (typeof EDITABLE_BUILTIN)[number], permId: string, checked: boolean) => {
    setRoleGrants((prev) => {
      const next = { ...prev, [role]: new Set(prev[role]) };
      if (checked) next[role].add(permId);
      else next[role].delete(permId);
      return next;
    });
  }, []);

  const actionLabels = useMemo(() => matrixActionLabels(), []);

  const toggleMatrixCell = useCallback(
    (role: (typeof EDITABLE_BUILTIN)[number], rowId: string, action: RbacMatrixAction, checked: boolean) => {
      const row = RBAC_MATRIX_ROWS.find((r) => r.id === rowId);
      if (!row) return;
      setRoleGrants((prev) => {
        const next = { ...prev, [role]: new Set(prev[role]) };
        applyMatrixCellToggle(row, action, checked, next[role]);
        return next;
      });
    },
    [],
  );

  const catalogListBase = useMemo(
    () => (Array.isArray(permissions) ? permissions : []).filter((p) => p.id !== "*"),
    [permissions],
  );

  const catalogFiltered = useMemo(() => {
    const q = catalogSearch.trim().toLowerCase();
    if (!q) return catalogListBase;
    return catalogListBase.filter(
      (p) =>
        p.label.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        (p.group ?? "").toLowerCase().includes(q) ||
        (BUILTIN_GROUP_LABELS[p.group || "other"] ?? "").toLowerCase().includes(q),
    );
  }, [catalogListBase, catalogSearch]);

  const catalogSorted = useMemo(() => {
    const copy = [...catalogFiltered];
    const s0 = catalogSorting[0];
    if (!s0) {
      copy.sort((a, b) => {
        const ga = BUILTIN_GROUP_LABELS[a.group || "other"] || a.group || "";
        const gb = BUILTIN_GROUP_LABELS[b.group || "other"] || b.group || "";
        const g = ga.localeCompare(gb);
        if (g !== 0) return g;
        return a.label.localeCompare(b.label);
      });
      return copy;
    }
    const dir = s0.desc ? -1 : 1;
    copy.sort((a, b) => {
      if (s0.id === "label") return a.label.localeCompare(b.label) * dir;
      if (s0.id === "id") return a.id.localeCompare(b.id) * dir;
      if (s0.id === "area") {
        const ga = BUILTIN_GROUP_LABELS[a.group || "other"] || a.group || "";
        const gb = BUILTIN_GROUP_LABELS[b.group || "other"] || b.group || "";
        const g = ga.localeCompare(gb);
        if (g !== 0) return g * dir;
        return a.label.localeCompare(b.label);
      }
      return 0;
    });
    return copy;
  }, [catalogFiltered, catalogSorting]);

  const catalogTotalRows = catalogSorted.length;
  const catalogPageRows = useMemo(() => {
    const start = catalogPageIndex * catalogPageSize;
    return catalogSorted.slice(start, start + catalogPageSize);
  }, [catalogSorted, catalogPageIndex, catalogPageSize]);

  const catalogPermissionColumns = useMemo<ColumnDef<RbacPermissionRow>[]>(() => {
    const role = selectedBuiltin;
    const grants = roleGrants[role] ?? new Set<string>();
    return [
      {
        id: "area",
        accessorFn: (p) => BUILTIN_GROUP_LABELS[p.group || "other"] || p.group || "Other",
        header: "Area",
        cell: ({ row }) => (
          <span className="text-muted-foreground text-xs">{String(row.getValue("area"))}</span>
        ),
      },
      {
        accessorKey: "label",
        header: "Capability",
        cell: ({ row }) => {
          const p = row.original;
          const cbId = `cat-${role}-${p.id}`;
          return (
            <Label htmlFor={cbId} className="cursor-pointer font-medium text-foreground text-sm leading-snug">
              {p.label}
            </Label>
          );
        },
      },
      {
        accessorKey: "id",
        header: () => <div className="text-center">Access type</div>,
        cell: ({ row }) => (
          <div className="flex justify-center">
            <Badge variant="secondary" className="font-normal tabular-nums">
              {permissionAccessType(row.original.id)}
            </Badge>
          </div>
        ),
      },
      {
        id: "allow",
        header: () => <div className="text-center">Allow</div>,
        cell: ({ row }) => {
          const p = row.original;
          const cbId = `cat-${role}-${p.id}`;
          const checked = grants.has(p.id);
          return (
            <div className="flex justify-center">
              <Checkbox
                id={cbId}
                checked={checked}
                onCheckedChange={(v) => togglePerm(role, p.id, v === true)}
                aria-label={`Allow ${p.label}`}
              />
            </div>
          );
        },
      },
      {
        id: "info",
        header: () => <span className="sr-only">API id</span>,
        cell: ({ row }) => (
          <div className="flex justify-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="size-8 text-muted-foreground hover:text-foreground"
                  aria-label={`Technical id: ${row.original.id}`}
                >
                  <HelpCircle className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent
                side="left"
                className="max-w-sm border border-border bg-popover text-popover-foreground"
              >
                <p className="font-medium text-[10px] text-muted-foreground">API permission id</p>
                <code className="mt-1 block break-all text-foreground text-xs">{row.original.id}</code>
              </TooltipContent>
            </Tooltip>
          </div>
        ),
      },
    ];
  }, [selectedBuiltin, roleGrants, togglePerm]);

  const customRolesTotal = customRows.length;
  const customRolesTableData = useMemo((): CustomRoleTableRow[] => {
    const start = customRolesPageIndex * customRolesPageSize;
    return customRows.slice(start, start + customRolesPageSize).map((row, i) => ({
      ...row,
      rowIndex: start + i,
    }));
  }, [customRows, customRolesPageIndex, customRolesPageSize]);

  useEffect(() => {
    setCatalogPageIndex(0);
  }, [selectedBuiltin]);

  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(Math.max(customRows.length, 1) / customRolesPageSize) - 1);
    if (customRolesPageIndex > maxPage) setCustomRolesPageIndex(maxPage);
  }, [customRows.length, customRolesPageIndex, customRolesPageSize]);

  const buildBuiltinOverridesPayload = (): Record<string, { can: string[] }> => {
    const prev = config?.builtinOverrides ?? {};
    const out: Record<string, { can: string[] }> = {};
    for (const [k, v] of Object.entries(prev)) {
      if (v && Array.isArray(v.can)) out[k] = { can: [...v.can] };
    }
    for (const r of EDITABLE_BUILTIN) {
      const defSet = expandCanToIdSet(defaults[r]?.can ?? [], catalogIds);
      const cur = roleGrants[r];
      if (idSetsEqual(defSet, cur)) delete out[r];
      else out[r] = { can: idSetToCanArray(cur) };
    }
    delete out.admin;
    return out;
  };

  const save = async () => {
    setSaving(true);
    try {
      const builtinOverrides = buildBuiltinOverridesPayload();
      const customRoles = customRows.map((row) => ({
        key: row.key,
        label: row.label || row.key,
        ...(row.inheritsFrom ? { inheritsFrom: row.inheritsFrom } : {}),
        can: idSetToCanArray(row.extraCan),
      }));
      await putRbacConfig({ builtinOverrides, customRoles });
      toast.success("Roles and permissions saved.");
      const cfgRes = await fetchRbacConfig();
      setConfig(cfgRes.data ?? null);
      await fetchMe();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const openNewCustom = () => {
    setEditIndex(null);
    setFormKey("");
    setFormLabel("");
    setFormInherits("");
    setFormExtra(new Set());
    setDialogOpen(true);
  };

  const openEditCustom = (index: number) => {
    const row = customRows[index];
    setEditIndex(index);
    setFormKey(row.key);
    setFormLabel(row.label);
    setFormInherits(row.inheritsFrom || "");
    setFormExtra(new Set(row.extraCan));
    setDialogOpen(true);
  };

  const saveCustomDialog = () => {
    const k = formKey.trim().toLowerCase().replace(/\s+/g, "_");
    if (!k || !/^[a-z][a-z0-9_]*$/.test(k)) {
      toast.warning("Role key: lowercase letters, numbers, and underscores only (must match API validation).");
      return;
    }
    const builtinReserved = new Set(
      (
        catalog?.builtinRoleKeys ?? [
          "admin",
          "manager",
          "waiter",
          "cashier",
          "kitchen",
          "hostess",
          "accountant",
          "accountant_readonly",
        ]
      ).map((x) => String(x).toLowerCase()),
    );
    if (builtinReserved.has(k)) {
      toast.warning("That key is reserved for a built-in role.");
      return;
    }
    if (customRows.some((r, i) => r.key === k && i !== editIndex)) {
      toast.warning("A custom role with that key already exists.");
      return;
    }
    const row: CustomRow = {
      key: k,
      label: formLabel.trim() || k,
      inheritsFrom: formInherits || "",
      extraCan: new Set(formExtra),
    };
    if (editIndex === null) setCustomRows((prev) => [...prev, row]);
    else setCustomRows((prev) => prev.map((r, i) => (i === editIndex ? row : r)));
    setDialogOpen(false);
  };

  const removeCustom = (index: number) => {
    if (!window.confirm("Remove this custom role? Staff using it may lose access until reassigned.")) return;
    setCustomRows((prev) => prev.filter((_, i) => i !== index));
  };

  const customRoleColumns = useMemo<ColumnDef<CustomRoleTableRow>[]>(
    () => [
      {
        accessorKey: "key",
        header: "Key",
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.key}</span>,
      },
      { accessorKey: "label", header: "Label" },
      {
        accessorKey: "inheritsFrom",
        header: "Inherits",
        cell: ({ row }) =>
          row.original.inheritsFrom ? (
            <Badge variant="outline">{row.original.inheritsFrom}</Badge>
          ) : (
            <span className="text-muted-foreground text-xs">None</span>
          ),
      },
      {
        id: "extra",
        accessorFn: (r) => r.extraCan.size,
        header: () => <div className="text-right">Extra perms</div>,
        cell: ({ row }) => (
          <div className="text-right tabular-nums">{row.original.extraCan.size}</div>
        ),
      },
      {
        id: "actions",
        header: () => <div className="text-right">Actions</div>,
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => openEditCustom(row.original.rowIndex)}>
              Edit
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => removeCustom(row.original.rowIndex)}
            >
              Remove
            </Button>
          </div>
        ),
      },
    ],
    [openEditCustom, removeCustom],
  );

  const inheritedSetForForm = useMemo(() => {
    if (!formInherits || !defaults[formInherits]) return new Set<string>();
    const can = mergeBuiltinEffective(defaults, config?.builtinOverrides ?? {}, formInherits);
    return expandCanToIdSet(can, catalogIds);
  }, [formInherits, defaults, config?.builtinOverrides, catalogIds]);

  const isLoading = loading;

  if (loadError && !catalog) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <div className="space-y-1">
          <h1 className="font-semibold text-3xl text-foreground tracking-tight">Roles & permissions</h1>
          <p className="text-destructive text-sm">{loadError}</p>
          <ul className="list-inside list-disc space-y-1 text-muted-foreground text-sm">
            <li>
              Set <code className="rounded bg-muted px-1 py-0.5 text-xs">NEXT_PUBLIC_POS_API_ORIGIN</code> to your POS
              API base URL (protocol + host + port, no trailing slash)—the same origin the browser uses for API calls.
            </li>
            <li>
              <strong className="text-foreground">401 / session:</strong>{" "}
              <Link prefetch={false} href="/login" className="text-primary underline-offset-4 hover:underline">
                Staff PIN sign-in
              </Link>{" "}
              (dev seed PINs 1001–1005 after{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">npm run seed:dev</code>
              ). Or use the Vite POS app with{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">POS_DEV_CROSS_SITE_COOKIES=true</code> on the API.
            </li>
          </ul>
        </div>
        <Button type="button" variant="outline" onClick={() => void reload()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="space-y-1">
        <h1 className="font-semibold text-3xl text-foreground tracking-tight">Roles & permissions</h1>
        <p className="max-w-3xl text-muted-foreground text-sm">
          Built-in roles match your server defaults; changes here are stored as overrides. Assign staff to a role or
          custom profile when adding users. Accounting templates (
          <code className="rounded bg-muted px-1 py-0.5 text-xs">accountant</code>,{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">accountant_readonly</code>) are for RBAC inheritance
          only—not selectable job titles on staff accounts. Powered by{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-foreground text-xs">@rbac/rbac</code> on the API.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : (
        <Tabs defaultValue="builtin" className="w-full">
          <TabsList className="inline-flex h-9 w-fit shrink-0 rounded-lg border border-border bg-muted/50 p-1">
            <TabsTrigger value="builtin" className="rounded-md px-4">
              Built-in roles
            </TabsTrigger>
            <TabsTrigger value="custom" className="rounded-md px-4">
              Custom roles
            </TabsTrigger>
          </TabsList>

          <TabsContent value="builtin" className="mt-4 space-y-5 outline-none">
            <Card className="border border-border bg-card shadow-sm ring-0">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Administrator</CardTitle>
                <CardDescription>{ROLE_DESCRIPTIONS.admin}</CardDescription>
              </CardHeader>
              <CardContent>
                <Badge variant="secondary" className="font-normal">
                  Permission: * (all operations)
                </Badge>
              </CardContent>
            </Card>

            <Card className="border border-border bg-card shadow-sm ring-0">
              <CardHeader className="space-y-1 pb-2">
                <CardTitle className="text-lg">Floor & back-office roles</CardTitle>
                <CardDescription>
                  Toggle what each role may do. Unchecked items are denied for that role (subject to how the API
                  evaluates patterns).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <Label htmlFor="builtin-role" className="text-foreground">
                    Edit role
                  </Label>
                  <Select
                    value={selectedBuiltin}
                    onValueChange={(v) => setSelectedBuiltin(v as (typeof EDITABLE_BUILTIN)[number])}
                  >
                    <SelectTrigger id="builtin-role" className="w-full sm:w-72">
                      <SelectValue placeholder="Choose role" />
                    </SelectTrigger>
                    <SelectContent>
                      {EDITABLE_BUILTIN.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r.charAt(0).toUpperCase() + r.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-muted-foreground text-sm">{ROLE_DESCRIPTIONS[selectedBuiltin]}</p>
                <Separator />
                <div className="space-y-2">
                  <p className="font-medium text-foreground text-sm">Permission matrix</p>
                  <p className="text-muted-foreground text-xs">
                    View through Disable map to API permission ids. Consecutive columns that control the same id are
                    merged so one toggle does not check several boxes at once.{" "}
                    <span className="font-medium text-foreground/90">N/A</span> means that action does not apply to the
                    module.
                  </p>
                  <div className="max-h-[min(28rem,55vh)] overflow-auto rounded-lg border bg-card shadow-sm ring-1 ring-border/60">
                    <Table className="min-w-[36rem]">
                      <TableHeader>
                        <TableRow className="border-border bg-muted/30 hover:bg-muted/30">
                          <TableHead className="sticky top-0 left-0 z-[3] min-w-[11rem] max-w-[14rem] bg-muted/95 py-2 font-medium text-xs backdrop-blur-sm supports-[backdrop-filter]:bg-muted/80">
                            Module
                          </TableHead>
                          {RBAC_MATRIX_ACTIONS.map((a) => (
                            <TableHead
                              key={a}
                              className="sticky top-0 z-[2] w-[4.75rem] min-w-[4.75rem] bg-muted/95 py-2 text-center font-medium text-xs backdrop-blur-sm supports-[backdrop-filter]:bg-muted/80"
                            >
                              {actionLabels[a]}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {RBAC_MATRIX_ROWS.map((row) => {
                          const grantSet = roleGrants[selectedBuiltin] ?? new Set<string>();
                          return (
                            <TableRow key={row.id} className="border-border/80">
                              <TableCell className="sticky left-0 z-[1] min-w-[11rem] max-w-[14rem] bg-card py-2 font-medium text-foreground text-xs leading-snug">
                                {row.label}
                              </TableCell>
                              {buildRbacMatrixRowCellRuns(row).map((run, runIdx) =>
                                run.kind === "notApplicable" ? (
                                  <TableCell
                                    key={`${row.id}-na-${runIdx}`}
                                    className="bg-card/80 p-1 text-center align-middle"
                                  >
                                    <span
                                      className="text-muted-foreground text-[10px] tabular-nums"
                                      title="Not applicable"
                                    >
                                      N/A
                                    </span>
                                  </TableCell>
                                ) : (
                                  <TableCell
                                    key={`${row.id}-perm-${runIdx}`}
                                    colSpan={run.colSpan}
                                    className="bg-card p-1 text-center align-middle"
                                  >
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div className="flex justify-center">
                                          <Checkbox
                                            key={`mxcb-${selectedBuiltin}-${row.id}-${run.actions.join("-")}`}
                                            id={`mx-${selectedBuiltin}-${row.id}-run-${runIdx}`}
                                            checked={matrixCellChecked(row, run.actions[0], grantSet)}
                                            onCheckedChange={(v) =>
                                              toggleMatrixCell(
                                                selectedBuiltin,
                                                row.id,
                                                run.actions[0],
                                                v === true,
                                              )
                                            }
                                            aria-label={`${row.label} — ${rbacMatrixRunSummary(run.actions)}`}
                                          />
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent
                                        side="top"
                                        className="max-w-xs border border-border bg-popover text-popover-foreground text-xs"
                                      >
                                        <span className="font-medium">{rbacMatrixRunSummary(run.actions)}</span>
                                        <span className="text-muted-foreground"> · </span>
                                        <code className="break-all">{run.ids.join(", ")}</code>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TableCell>
                                ),
                              )}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
                <Separator />
                <details className="group rounded-lg border border-border bg-muted/10">
                  <summary className="cursor-pointer select-none px-3 py-2 font-medium text-foreground text-sm marker:content-['']">
                    <span className="ml-1 inline-flex items-center gap-2">
                      <span className="text-muted-foreground group-open:hidden">▸</span>
                      <span className="text-muted-foreground hidden group-open:inline">▾</span>
                      Advanced: all permission ids (catalog)
                    </span>
                  </summary>
                  <div className="border-border border-t p-3">
                    <DataTable
                      columns={catalogPermissionColumns}
                      data={catalogPageRows}
                      isLoading={false}
                      emptyMessage="No permissions in catalog."
                      searchPlaceholder="Search by capability, id, or area…"
                      searchValue={catalogSearch}
                      onSearchValueChange={(value) => {
                        setCatalogSearch(value);
                        setCatalogPageIndex(0);
                      }}
                      pageIndex={catalogPageIndex}
                      pageSize={catalogPageSize}
                      totalRows={catalogTotalRows}
                      onPageChange={setCatalogPageIndex}
                      onPageSizeChange={(value) => {
                        setCatalogPageSize(value);
                        setCatalogPageIndex(0);
                      }}
                      sorting={catalogSorting}
                      onSortingChange={setCatalogSorting}
                      stickyHeader
                    />
                  </div>
                </details>
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const can = mergeBuiltinEffective(defaults, config?.builtinOverrides ?? {}, selectedBuiltin);
                      setRoleGrants((prev) => ({
                        ...prev,
                        [selectedBuiltin]: expandCanToIdSet(can, catalogIds),
                      }));
                      toast.message("Reloaded this role from saved config.");
                    }}
                  >
                    Reload from server
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const can = defaults[selectedBuiltin]?.can ?? [];
                      setRoleGrants((prev) => ({
                        ...prev,
                        [selectedBuiltin]: expandCanToIdSet(can, catalogIds),
                      }));
                      toast.message("Reset to code defaults.");
                    }}
                  >
                    Reset to code defaults
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="custom" className="mt-4 outline-none">
            <Card className="border border-border bg-card shadow-sm ring-0">
              <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-lg">Custom roles</CardTitle>
                  <CardDescription>
                    Optional profiles (e.g. barista). They can inherit a built-in role and add permissions. Assign via
                    staff <strong>Permission profile</strong>.
                  </CardDescription>
                </div>
                <Button type="button" onClick={openNewCustom}>
                  Add custom role
                </Button>
              </CardHeader>
              <CardContent>
                <DataTable
                  columns={customRoleColumns}
                  data={customRolesTableData}
                  isLoading={false}
                  emptyMessage='No custom roles yet. Use "Add custom role" to create a permission profile.'
                  searchPlaceholder=""
                  searchValue=""
                  onSearchValueChange={() => {}}
                  pageIndex={customRolesPageIndex}
                  pageSize={customRolesPageSize}
                  totalRows={customRolesTotal}
                  onPageChange={setCustomRolesPageIndex}
                  onPageSizeChange={() => {}}
                  sorting={[]}
                  onSortingChange={() => {}}
                  showToolbar={false}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2 border-border border-t pt-4">
        <Button type="button" size="lg" disabled={saving || isLoading} onClick={() => void save()}>
          {saving ? "Saving…" : "Save RBAC configuration"}
        </Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[92vh] gap-0 overflow-hidden border border-border bg-card p-0 text-card-foreground shadow-xl ring-1 ring-border sm:max-w-2xl">
          {" "}
          <DialogHeader className="space-y-1.5 border-border border-b bg-card px-6 py-4 text-left">
            <DialogTitle className="text-lg">{editIndex === null ? "New custom role" : "Edit custom role"}</DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm">
              Keys are saved in lowercase. Inheritance copies the built-in role&apos;s access; the table below is{" "}
              <span className="font-medium text-foreground">extra</span> permissions only.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[min(30rem,62vh)] bg-card">
            <div className="space-y-4 px-6 py-4">
              <div className="space-y-2">
                <Label htmlFor="cr-key">Role key</Label>
                <Input
                  id="cr-key"
                  value={formKey}
                  onChange={(e) => setFormKey(e.target.value)}
                  placeholder="e.g. barista"
                  disabled={editIndex !== null}
                  className="bg-background font-mono text-sm"
                />
                <p className="text-muted-foreground text-xs">
                  Stored as lowercase (e.g. <code className="rounded bg-muted px-1">barista</code>).
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cr-label">Display label</Label>
                <Input
                  id="cr-label"
                  value={formLabel}
                  onChange={(e) => setFormLabel(e.target.value)}
                  placeholder="Barista"
                  className="bg-background"
                />
              </div>
              <div className="space-y-2">
                <Label>Inherit from built-in</Label>
                <Select
                  value={formInherits || "__none__"}
                  onValueChange={(v) => setFormInherits(v === "__none__" ? "" : v)}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent className="border-border bg-popover text-popover-foreground">
                    <SelectItem value="__none__">None</SelectItem>
                    {INHERIT_PARENT_OPTIONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {inheritParentLabel(r)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {formInherits ? (
                <div className="rounded-lg border border-border bg-muted/25 p-3 text-sm">
                  <p className="font-medium text-foreground">From {formInherits}</p>
                  <p className="mt-1 text-muted-foreground text-xs">
                    {inheritedSetForForm.size} permission
                    {inheritedSetForForm.size === 1 ? "" : "s"} included via inheritance (read-only here).
                  </p>
                </div>
              ) : null}
              <Separator />
              <p className="font-semibold text-foreground text-sm">Extra permissions (matrix)</p>
              <p className="text-muted-foreground text-xs">
                Cells satisfied only by inheritance are disabled. Same permission across multiple columns is merged
                into one control. <span className="font-medium text-foreground/90">N/A</span> means not applicable.
              </p>
              <div className="max-h-[min(20rem,42vh)] overflow-auto rounded-lg border bg-card shadow-sm ring-1 ring-border/60">
                <Table className="min-w-[32rem]">
                  <TableHeader>
                    <TableRow className="border-border bg-muted/30 hover:bg-muted/30">
                      <TableHead className="sticky top-0 left-0 z-[3] min-w-[9.5rem] bg-muted/95 py-2 font-medium text-xs backdrop-blur-sm supports-[backdrop-filter]:bg-muted/80">
                        Module
                      </TableHead>
                      {RBAC_MATRIX_ACTIONS.map((a) => (
                        <TableHead
                          key={a}
                          className="sticky top-0 z-[2] w-[4.25rem] min-w-[4.25rem] bg-muted/95 py-2 text-center font-medium text-xs backdrop-blur-sm supports-[backdrop-filter]:bg-muted/80"
                        >
                          {actionLabels[a]}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {RBAC_MATRIX_ROWS.map((row) => (
                      <TableRow key={`cr-${row.id}`} className="border-border/80">
                        <TableCell className="sticky left-0 z-[1] min-w-[9.5rem] bg-card py-2 font-medium text-foreground text-xs leading-snug">
                          {row.label}
                        </TableCell>
                        {buildRbacMatrixRowCellRuns(row).map((run, runIdx) =>
                          run.kind === "notApplicable" ? (
                            <TableCell
                              key={`cr-${row.id}-na-${runIdx}`}
                              className="bg-card/80 p-1 text-center align-middle"
                            >
                              <span
                                className="text-muted-foreground text-[10px] tabular-nums"
                                title="Not applicable"
                              >
                                N/A
                              </span>
                            </TableCell>
                          ) : (
                            <TableCell
                              key={`cr-${row.id}-perm-${runIdx}`}
                              colSpan={run.colSpan}
                              className="bg-card p-1 text-center align-middle"
                            >
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="flex justify-center">
                                    <Checkbox
                                      key={`crmxcb-${row.id}-${run.actions.join("-")}`}
                                      id={`cr-mx-${row.id}-run-${runIdx}`}
                                      checked={matrixCellCheckedCustom(
                                        row,
                                        run.actions[0],
                                        inheritedSetForForm,
                                        formExtra,
                                      )}
                                      disabled={matrixCellFullyInherited(
                                        row,
                                        run.actions[0],
                                        inheritedSetForForm,
                                      )}
                                      onCheckedChange={(v) => {
                                        setFormExtra((prev) => {
                                          const n = new Set(prev);
                                          toggleMatrixCellCustom(
                                            row,
                                            run.actions[0],
                                            v === true,
                                            inheritedSetForForm,
                                            n,
                                          );
                                          return n;
                                        });
                                      }}
                                      aria-label={`${row.label} — ${rbacMatrixRunSummary(run.actions)}`}
                                    />
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent
                                  side="top"
                                  className="max-w-xs border border-border bg-popover text-popover-foreground text-xs"
                                >
                                  <span className="font-medium">{rbacMatrixRunSummary(run.actions)}</span>
                                  <span className="text-muted-foreground"> · </span>
                                  <code className="break-all">{run.ids.join(", ")}</code>
                                </TooltipContent>
                              </Tooltip>
                            </TableCell>
                          ),
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="pt-3 font-semibold text-foreground text-sm">Extra permissions (full list)</p>
              <div className="overflow-hidden rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border bg-muted/30 hover:bg-muted/30">
                      <TableHead className="h-9 text-xs">Capability</TableHead>
                      <TableHead className="h-9 w-[88px] text-center text-xs">Type</TableHead>
                      <TableHead className="h-9 w-[72px] text-center text-xs">Allow</TableHead>
                      <TableHead className="h-9 w-10 p-1" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(Array.isArray(permissions) ? permissions : [])
                      .filter((p) => p.id !== "*")
                      .map((p) => {
                        const fromParent = inheritedSetForForm.has(p.id);
                        const checked = formExtra.has(p.id) || fromParent;
                        const xid = `xd-${(formKey || "new").replace(/\s+/g, "_")}-${p.id}`;
                        return (
                          <TableRow
                            key={p.id}
                            className={fromParent ? "border-border/80 bg-muted/15" : "border-border/80"}
                          >
                            <TableCell className="py-2">
                              <Label
                                htmlFor={xid}
                                className={
                                  fromParent
                                    ? "text-muted-foreground text-sm"
                                    : "cursor-pointer font-medium text-foreground text-sm"
                                }
                              >
                                {p.label}
                                {fromParent ? (
                                  <span className="mt-0.5 block font-normal text-[10px] text-muted-foreground">
                                    Included from parent
                                  </span>
                                ) : null}
                              </Label>
                            </TableCell>
                            <TableCell className="py-2 text-center">
                              <Badge variant="outline" className="font-normal text-xs">
                                {permissionAccessType(p.id)}
                              </Badge>
                            </TableCell>
                            <TableCell className="py-2 text-center">
                              <div className="flex justify-center">
                                <Checkbox
                                  id={xid}
                                  checked={checked}
                                  disabled={fromParent}
                                  onCheckedChange={(v) => {
                                    if (fromParent) return;
                                    setFormExtra((prev) => {
                                      const n = new Set(prev);
                                      if (v === true) n.add(p.id);
                                      else n.delete(p.id);
                                      return n;
                                    });
                                  }}
                                  aria-label={`Allow ${p.label}`}
                                />
                              </div>
                            </TableCell>
                            <TableCell className="p-1 text-center">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-sm"
                                    className="size-8 text-muted-foreground"
                                    aria-label={`Technical id: ${p.id}`}
                                  >
                                    <HelpCircle className="size-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent
                                  side="left"
                                  className="max-w-sm border border-border bg-popover text-popover-foreground"
                                >
                                  <code className="text-xs">{p.id}</code>
                                </TooltipContent>
                              </Tooltip>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              </div>
            </div>
          </ScrollArea>
          <DialogFooter className="border-border border-t bg-card px-6 py-4">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={saveCustomDialog}>
              {editIndex === null ? "Add role" : "Save role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
