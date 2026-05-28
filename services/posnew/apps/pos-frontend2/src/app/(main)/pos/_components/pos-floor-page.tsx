"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { LayoutGrid, Plus, Tag } from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";

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
import { formatPosMutationError } from "@/lib/format-pos-api-error";
import { fetchLocations, type LocationRow } from "@/lib/inventory-api";
import { locationLabel } from "@/lib/pos-auth-user";
import { getPosLocationScopeId, locationIdFromUserLocation, setPosLocationScopeId } from "@/lib/pos-location-scope";
import { posQueryKeys } from "@/lib/pos-query-keys";
import { type PosTableRow, posCreateTable, posFetchTables } from "@/lib/pos-tables-api";
import { fieldErrorsFromZodError } from "@/lib/schemas/accounting/zod-field-errors";
import { posFloorCreateTableSchema } from "@/lib/schemas/pos-floor";
import { cn } from "@/lib/utils";
import { usePosAuthStore } from "@/stores/pos-auth-store";

function locationDisplayName(row: LocationRow): string {
  const name = row.name?.trim();
  const code = row.code?.trim();
  if (name && code) return `${name} (${code})`;
  return name || code || "Branch";
}

function tablesSignature(rows: readonly PosTableRow[]): string {
  return rows
    .map((row) =>
      [
        String(row._id ?? ""),
        String(row.tableNo ?? ""),
        String(row.name ?? ""),
        String(row.seats ?? ""),
        String(row.section ?? ""),
        String(row.status ?? ""),
        String(row.currentOrder ?? ""),
        String(row.visibleInPos ?? ""),
        String(row.reservatorIsVip ?? ""),
        String(row.reservatorName ?? ""),
      ].join("|"),
    )
    .join("||");
}

export function PosFloorPage() {
  const router = useRouter();
  const user = usePosAuthStore((s) => s.user);
  const assignedBranchId = useMemo(() => locationIdFromUserLocation(user?.location ?? null), [user?.location]);
  const assignedBranchLabel = useMemo(() => locationLabel(user?.location ?? null), [user?.location]);
  const needsBranchPicker = !assignedBranchId;

  const [displayedTables, setDisplayedTables] = useState<PosTableRow[]>([]);
  const [open, setOpen] = useState(false);
  const [tableNo, setTableNo] = useState("");
  const [tableName, setTableName] = useState("");
  const [seats, setSeats] = useState("4");
  const [creating, setCreating] = useState(false);
  const [createTableErrors, setCreateTableErrors] = useState<Record<string, string>>({});

  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [_selectedSection, _setSelectedSection] = useState<string>("ALL");
  const lastTablesSignatureRef = useRef<string>("");
  const lastToastAtRef = useRef<number>(0);

  const effectiveBranchId = assignedBranchId || selectedBranchId;
  const scopeReady = Boolean(effectiveBranchId);

  useEffect(() => {
    if (assignedBranchId) setPosLocationScopeId(assignedBranchId);
  }, [assignedBranchId]);

  useEffect(() => {
    if (!needsBranchPicker) return;
    let cancelled = false;
    (async () => {
      setLocationsLoading(true);
      try {
        const res = await fetchLocations();
        if (cancelled) return;
        const list = Array.isArray(res.data) ? res.data : [];
        setLocations(list);
        const saved = getPosLocationScopeId();
        if (list.length === 1) {
          const id = list[0]._id;
          setSelectedBranchId(id);
          setPosLocationScopeId(id);
        } else if (saved && list.some((l) => l._id === saved)) {
          setSelectedBranchId(saved);
          setPosLocationScopeId(saved);
        } else {
          setSelectedBranchId("");
          setPosLocationScopeId(null);
        }
      } catch (e) {
        if (!cancelled) {
          toast.error(formatPosMutationError(e, { forbiddenHint: "You can't load branches for this account." }));
          setLocations([]);
        }
      } finally {
        if (!cancelled) setLocationsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [needsBranchPicker]);

  const tablesQuery = useQuery({
    queryKey: posQueryKeys.tables(effectiveBranchId ?? null),
    queryFn: () => posFetchTables(effectiveBranchId || undefined),
    enabled: scopeReady,
    staleTime: 10_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!scopeReady) {
      lastTablesSignatureRef.current = "";
      setDisplayedTables([]);
      return;
    }
    const list = tablesQuery.data ?? [];
    const nextSignature = tablesSignature(list);
    if (nextSignature !== lastTablesSignatureRef.current) {
      lastTablesSignatureRef.current = nextSignature;
      setDisplayedTables(list.filter((t) => t.visibleInPos !== false));
    }
  }, [scopeReady, tablesQuery.data]);

  useEffect(() => {
    if (!tablesQuery.error) return;
    const now = Date.now();
    if (now - lastToastAtRef.current < 30_000) return;
    lastToastAtRef.current = now;
    toast.error(
      formatPosMutationError(tablesQuery.error, {
        forbiddenHint: "You can't load tables for this branch.",
      }),
    );
  }, [tablesQuery.error]);

  const onBranchSelect = (id: string) => {
    setSelectedBranchId(id);
    setPosLocationScopeId(id);
  };

  const handleCreate = async () => {
    const parsed = posFloorCreateTableSchema.safeParse({
      branchId: effectiveBranchId || "",
      tableNumberRaw: tableNo,
    });
    if (!parsed.success) {
      setCreateTableErrors(fieldErrorsFromZodError(parsed.error));
      return;
    }
    setCreateTableErrors({});
    const n = Number.parseInt(tableNo, 10);
    const allTables = tablesQuery.data ?? [];
    const clash = allTables.find((t) => t.tableNo === n);
    if (clash) {
      toast.error(`Table ${n} is already taken by "${clash.name || `Table ${clash.tableNo}`}".`);
      return;
    }
    const s = Number(seats);
    setCreating(true);
    try {
      const created = await posCreateTable({
        tableNo: n,
        name: tableName.trim() || `Table ${n}`,
        seats: Number.isFinite(s) && s > 0 ? s : 4,
        visibleInPos: true,
      });
      const id = String(created._id ?? "").trim();
      toast.success("Table created.");
      setOpen(false);
      setTableNo("");
      setTableName("");
      setSeats("4");
      if (id) {
        router.push(`/pos/t/${id}`);
        return;
      }
      await tablesQuery.refetch();
    } catch (e) {
      toast.error(formatPosMutationError(e, { forbiddenHint: "You can't create tables for this branch." }));
    } finally {
      setCreating(false);
    }
  };

  const createDisabled = creating || !scopeReady || (needsBranchPicker && locationsLoading);

  return (
    <div className="flex h-full flex-col overflow-hidden p-4 md:p-6">
      <div className="mx-auto flex w-full max-w-[1600px] shrink-0 flex-col gap-6 border-zinc-800/50 border-b pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-600 shadow-emerald-900/40 shadow-lg">
              <LayoutGrid className="size-5 text-white" />
            </div>
            <h1 className="font-black text-3xl text-white uppercase italic tracking-tight">Floor Plan</h1>
          </div>
          <p className="ps-1 font-black text-[9px] text-zinc-500 uppercase tracking-[0.3em]">
            Real-time Terminal Sync — Professional Edition
          </p>
        </div>

        {needsBranchPicker ? (
          <div className="group relative min-w-[340px] overflow-hidden rounded-2xl bg-zinc-900/40 p-0.5 ring-1 ring-zinc-800/50 transition-all hover:bg-zinc-900/60">
            <div className="flex items-center gap-4 px-4 py-2.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-950 text-emerald-500 shadow-inner">
                <Tag className="size-4" />
              </div>
              <div className="flex-1 overflow-hidden">
                <label className="mb-0.5 block font-black text-[8px] text-zinc-600 uppercase tracking-[0.2em]">
                  Operational Branch
                </label>
                {locationsLoading ? (
                  <div className="h-4 w-32 animate-pulse rounded bg-zinc-800/50" />
                ) : (
                  <Select value={selectedBranchId || undefined} onValueChange={onBranchSelect}>
                    <SelectTrigger className="h-auto w-full border-none bg-transparent p-0 font-black text-sm text-zinc-100 shadow-none focus:ring-0">
                      <SelectValue placeholder="Select location..." />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl border-zinc-800 bg-zinc-950/95 text-zinc-50 shadow-2xl backdrop-blur-xl">
                      {locations.map((loc) => (
                        <SelectItem
                          key={loc._id}
                          value={loc._id}
                          className="mx-1 my-1 cursor-pointer rounded-xl font-bold transition-colors focus:bg-emerald-600 focus:text-white"
                        >
                          {locationDisplayName(loc)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          </div>
        ) : assignedBranchLabel ? (
          <div className="flex items-center gap-3 rounded-2xl bg-zinc-900/40 px-5 py-3 shadow-xl ring-1 ring-zinc-800/50">
            <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
            <span className="font-black text-[9px] text-zinc-300 uppercase tracking-[0.2em]">{assignedBranchLabel}</span>
          </div>
        ) : null}
      </div>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setCreateTableErrors({});
        }}
      >
        <DialogContent className="rounded-[2.5rem] border-zinc-800 bg-zinc-950 text-zinc-50 shadow-2xl sm:max-w-md">
          <DialogHeader className="pt-4">
            <DialogTitle className="font-black text-2xl uppercase tracking-tight">Add New Table</DialogTitle>
            <DialogDescription className="font-bold text-[9px] text-zinc-500 uppercase tracking-widest">
              Provisioning terminal resource for Table {tableNo}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-6 py-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-1 space-y-2">
                <Label htmlFor="pos-new-table-no" className="ps-1 font-black text-[10px] text-zinc-500 uppercase tracking-widest">
                  Table #
                </Label>
                <Input
                  id="pos-new-table-no"
                  type="number"
                  min={1}
                  step={1}
                  value={tableNo}
                  onChange={(e) => {
                    setTableNo(e.target.value);
                    setCreateTableErrors((p) => ({ ...p, tableNumberRaw: "" }));
                  }}
                  placeholder="12"
                  className="h-12 rounded-xl border-zinc-800 bg-zinc-900/50 font-black text-lg text-white"
                />
                {createTableErrors.tableNumberRaw ? (
                  <p className="font-bold text-[10px] text-red-400">{createTableErrors.tableNumberRaw}</p>
                ) : null}
              </div>
              <div className="col-span-2 space-y-2">
                <Label htmlFor="pos-new-table-name" className="ps-1 font-black text-[10px] text-zinc-500 uppercase tracking-widest">
                  Display Name
                </Label>
                <Input
                  id="pos-new-table-name"
                  value={tableName}
                  onChange={(e) => setTableName(e.target.value)}
                  placeholder="VIP Booth"
                  className="h-12 rounded-xl border-zinc-800 bg-zinc-900/50 font-bold"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pos-new-seats" className="ps-1 font-black text-[10px] text-zinc-500 uppercase tracking-widest">
                Seats / Capacity
              </Label>
              <Input
                id="pos-new-seats"
                type="number"
                min={1}
                value={seats}
                onChange={(e) => setSeats(e.target.value)}
                className="h-12 rounded-xl border-zinc-800 bg-zinc-900/50 font-bold"
              />
            </div>
            {createTableErrors.branchId ? <p className="font-bold text-[10px] text-red-400">{createTableErrors.branchId}</p> : null}
          </div>
          <DialogFooter className="pb-4">
            <button
              type="button"
              disabled={createDisabled}
              onClick={() => {
                void handleCreate();
              }}
              className={cn(
                "h-14 w-full rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all",
                createDisabled
                  ? "border border-zinc-800 bg-zinc-900 text-zinc-700 opacity-50"
                  : "bg-emerald-600 text-white shadow-emerald-950/20 shadow-lg hover:bg-emerald-500 active:scale-95",
              )}
            >
              {creating ? "Provisioning..." : "Create Terminal"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="mt-6 min-h-0 flex-1 overflow-y-auto pb-20">
        <div className="mx-auto w-full max-w-[1600px]">
          {!scopeReady ? (
            <div className="flex flex-col items-center justify-center py-40 text-center">
              <div className="mb-8 flex h-28 w-28 items-center justify-center rounded-[2.5rem] bg-zinc-900/40 text-zinc-800 shadow-inner ring-1 ring-zinc-800">
                <LayoutGrid className="size-12" />
              </div>
              <h2 className="font-black text-2xl text-white uppercase tracking-tight">Select Branch Scope</h2>
              <p className="mt-3 max-w-xs font-bold text-[10px] text-zinc-600 uppercase leading-relaxed tracking-[0.2em]">
                Please authorize a terminal location to access the floor plan and live availability.
              </p>
            </div>
          ) : tablesQuery.isPending ? (
            <div className="grid animate-pulse gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-48 rounded-[2rem] border border-zinc-800/50 bg-zinc-900/20" />
              ))}
            </div>
          ) : displayedTables.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-[3rem] border-2 border-zinc-800/50 border-dashed bg-zinc-950/20 py-20 text-center">
              <div className="mb-8 flex h-24 w-24 items-center justify-center rounded-[2rem] bg-emerald-500/5 text-emerald-500 ring-1 ring-emerald-500/20">
                <Plus className="size-10" />
              </div>
              <h2 className="font-black text-2xl text-white uppercase tracking-tight">Empty Floor Plan</h2>
              <p className="mx-auto mt-3 mb-10 max-w-sm font-bold text-[10px] text-zinc-600 uppercase leading-relaxed tracking-[0.2em]">
                No terminals have been provisioned for this branch yet. Add your first table to start operations.
              </p>
              <button
                onClick={() => {
                  setTableNo("1");
                  setTableName("Table 1");
                  setOpen(true);
                }}
                className="rounded-2xl bg-emerald-600 px-10 py-4 font-black text-[10px] text-white uppercase tracking-[0.2em] shadow-emerald-950/20 shadow-xl transition-all hover:bg-emerald-500 active:scale-95"
              >
                + Initialize Floor
              </button>
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {displayedTables.map((t) => {
                const id = String(t._id);
                const normalizedStatus = String(t.status || "").toLowerCase();
                const hasOrder = Boolean(t.currentOrder);
                const effectiveStatus = hasOrder && normalizedStatus === "available" ? "occupied" : normalizedStatus;
                const statusMeta =
                  effectiveStatus === "reserved"
                    ? { label: "Reserved", color: "bg-orange-500", pulse: false }
                    : effectiveStatus === "occupied"
                      ? { label: "Occupied", color: "bg-red-500", pulse: true }
                      : effectiveStatus === "billed"
                        ? { label: "Billed", color: "bg-blue-500", pulse: false }
                        : effectiveStatus === "closed"
                          ? { label: "Closed", color: "bg-zinc-500", pulse: false }
                          : { label: "Available", color: "bg-emerald-500", pulse: false };

                return (
                  <Link
                    key={id}
                    href={`/pos/t/${id}`}
                    className="group relative block transition-all duration-500 active:scale-95"
                  >
                    <div
                      className={cn(
                        "relative h-full overflow-hidden rounded-[2rem] border p-6 backdrop-blur-xl transition-all duration-500",
                        statusMeta.label === "Occupied"
                          ? "border-red-500/20 bg-red-950/10 shadow-[0_0_40px_rgba(239,68,68,0.08)] hover:border-red-500/40 hover:bg-red-950/20"
                          : "border-zinc-800 bg-zinc-900/40 shadow-2xl hover:border-emerald-500/30 hover:bg-zinc-900/60",
                      )}
                    >
                      <div className={cn("absolute top-0 left-0 h-1.5 w-full opacity-60", statusMeta.color)} />

                      <div className="flex h-full flex-col">
                        <div className="mb-6 flex items-start justify-between">
                          <div className="space-y-1">
                            <span className="font-black text-[9px] text-zinc-600 uppercase tracking-[0.2em]">Terminal</span>
                            <h3 className="font-black text-4xl text-white tabular-nums tracking-tighter">{t.tableNo ?? "—"}</h3>
                          </div>
                          <div
                            className={cn(
                              "flex h-10 w-10 items-center justify-center rounded-2xl text-white shadow-2xl transition-all duration-500 group-hover:scale-110",
                              statusMeta.color,
                            )}
                          >
                            <LayoutGrid className="size-5" />
                          </div>
                        </div>

                        <div className="mt-auto space-y-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <div
                              className={cn(
                                "size-2 rounded-full",
                                statusMeta.pulse ? "animate-pulse shadow-[0_0_8px_#ef4444]" : "",
                                statusMeta.color,
                              )}
                            />
                            <span className="font-black text-[10px] text-zinc-400 uppercase tracking-widest">
                              {statusMeta.label}
                            </span>
                            {t.reservatorIsVip && t.reservatorName?.trim() ? (
                              <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 font-black text-[9px] text-amber-400 uppercase tracking-widest ring-1 ring-amber-500/30">
                                ★ VIP
                              </span>
                            ) : null}
                          </div>
                          {t.reservatorName?.trim() &&
                          (effectiveStatus === "reserved" || effectiveStatus === "occupied") ? (
                            <p
                              className={cn(
                                "truncate font-bold text-[10px]",
                                t.reservatorIsVip ? "text-amber-400/90" : "text-zinc-500",
                              )}
                              title={t.reservatorName}
                            >
                              {t.reservatorIsVip ? "★ " : null}
                              {t.reservatorName}
                            </p>
                          ) : null}

                          <div className="flex items-center gap-6 border-zinc-800/50 border-t pt-4">
                            <div className="flex flex-col">
                              <span className="font-black text-[11px] text-zinc-200 tabular-nums">{t.seats ?? "—"}</span>
                              <span className="font-black text-[8px] text-zinc-600 uppercase tracking-widest">Seats</span>
                            </div>
                            {t.section && (
                              <div className="flex flex-col border-zinc-800 border-l pl-4">
                                <span className="max-w-[80px] truncate font-black text-[11px] text-zinc-200">{t.section}</span>
                                <span className="font-black text-[8px] text-zinc-600 uppercase tracking-widest">Section</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Glossy Hover Effect */}
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                    </div>
                  </Link>
                );
              })}

              <button
                type="button"
                onClick={() => {
                  const nextNo = Math.max(...displayedTables.map((t) => t.tableNo || 0), 0) + 1;
                  setTableNo(String(nextNo));
                  setTableName(`Table ${nextNo}`);
                  setOpen(true);
                }}
                className="group relative flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-[2rem] border-2 border-zinc-800/50 border-dashed bg-zinc-950/50 p-6 shadow-inner transition-all duration-500 hover:border-emerald-500/40 hover:bg-zinc-900/40 active:scale-95"
              >
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-900 text-zinc-600 shadow-xl transition-all duration-500 group-hover:bg-emerald-600 group-hover:text-white">
                  <Plus className="size-6" />
                </div>
                <span className="font-black text-[10px] text-zinc-600 uppercase tracking-[0.2em] transition-colors group-hover:text-emerald-500">
                  Add Table {Math.max(...displayedTables.map((t) => t.tableNo || 0), 0) + 1}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
