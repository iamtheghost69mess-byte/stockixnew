"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Activity,
  Cpu,
  Loader2,
  Pencil,
  Plus,
  Printer as PrinterIcon,
  RefreshCw,
  Trash2,
  Usb,
  Wifi,
} from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  autoReconnectBluetoothPrinter,
  getBluetoothConnectionState,
  isPrintingSupported,
  requestBluetoothPrinter,
} from "@/lib/bluetooth-printer";
import { fetchLocationsList, normalizeLocationsQueryData } from "@/lib/inventory-api";
import {
  type PosPrinter,
  type PosPrinterDiscoveryItem,
  posCreatePrinter,
  posDeletePrinter,
  posDiscoverPrinters,
  posFetchPrinters,
  posGetPrinterStatus,
  posTestPrint,
  posUpdatePrinter,
} from "@/lib/pos-printer-api";
import { type PosPrinterFormData, posPrinterSchema } from "@/lib/schemas/printer";

export default function PrintersPage() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPrinter, setEditingPrinter] = useState<PosPrinter | null>(null);
  const [statusByPrinterId, setStatusByPrinterId] = useState<
    Record<string, { online: boolean; detail: string; lastCheckedAt?: string }>
  >({});
  const [checkingStatusByPrinterId, setCheckingStatusByPrinterId] = useState<Record<string, boolean>>({});
  const [pairedBluetoothPrinterId, setPairedBluetoothPrinterId] = useState("");
  const [terminalBluetoothConnected, setTerminalBluetoothConnected] = useState(false);
  const [detectingBluetooth, setDetectingBluetooth] = useState(false);
  const [discoveringBackend, setDiscoveringBackend] = useState(false);
  const [backendDiscoveryItems, setBackendDiscoveryItems] = useState<PosPrinterDiscoveryItem[]>([]);
  const [backendDiscoveryMeta, setBackendDiscoveryMeta] = useState<{
    scannedAt?: string;
    online?: number;
    offline?: number;
  }>({});
  const [reviewOpen, setReviewOpen] = useState(false);
  const [pendingSubmitData, setPendingSubmitData] = useState<PosPrinterFormData | null>(null);
  const [reviewChanges, setReviewChanges] = useState<Array<{ field: string; from: string; to: string }>>([]);
  const [reviewConfirmText, setReviewConfirmText] = useState("");

  // 1. Fetch Data
  const { data: printersRes, isLoading: isLoadingPrinters } = useQuery({
    queryKey: ["printer-list"],
    queryFn: posFetchPrinters,
  });
  const printers = Array.isArray(printersRes?.data) ? printersRes.data : [];

  const { data: locationsRaw } = useQuery({
    queryKey: ["locations"],
    queryFn: fetchLocationsList,
  });
  const locations = normalizeLocationsQueryData(locationsRaw);

  // 2. Mutations
  const createMutation = useMutation({
    mutationFn: posCreatePrinter,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["printer-list"] });
      toast.success("Printer registered successfully.");
      handleCloseDialog();
    },
    onError: (err: any) => toast.error(err.message || "Failed to register printer."),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<PosPrinter> }) => posUpdatePrinter(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["printer-list"] });
      toast.success("Printer configuration updated.");
      handleCloseDialog();
    },
    onError: (err: any) => toast.error(err.message || "Failed to update printer."),
  });

  const deleteMutation = useMutation({
    mutationFn: posDeletePrinter,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["printer-list"] });
      toast.success("Printer removed.");
    },
    onError: (err: any) => toast.error(err.message || "Failed to remove printer."),
  });

  const testPrintMutation = useMutation({
    mutationFn: posTestPrint,
    onSuccess: () => toast.success("Test print job sent to queue."),
    onError: (err: any) => toast.error(err.message || "Test print failed."),
  });

  // 3. Form Setup
  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    control,
    reset,
    setValue,
  } = useForm<PosPrinterFormData>({
    resolver: zodResolver(posPrinterSchema),
    defaultValues: {
      name: "",
      type: "network",
      thermalDriver: "epson",
      ipAddress: "",
      port: 9100,
      eposUrl: "",
      usbVendorId: "",
      usbProductId: "",
      bluetoothAddress: "",
      location: null,
    },
  });

  const handleOpenDialog = (printer?: PosPrinter) => {
    if (printer) {
      setEditingPrinter(printer);
      reset({
        name: printer.name || "",
        type: printer.type || "network",
        thermalDriver: printer.thermalDriver || "epson",
        ipAddress: printer.ipAddress || "",
        port: printer.port || 9100,
        eposUrl: printer.eposUrl || "",
        usbVendorId: printer.usbVendorId || "",
        usbProductId: printer.usbProductId || "",
        bluetoothAddress: printer.bluetoothAddress || "",
        location: printer.location || null,
      });
    } else {
      setEditingPrinter(null);
      reset({
        name: "",
        type: "network",
        thermalDriver: "epson",
        ipAddress: "",
        port: 9100,
        eposUrl: "",
        usbVendorId: "",
        usbProductId: "",
        bluetoothAddress: "",
        location: null,
      });
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingPrinter(null);
    reset();
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    setPairedBluetoothPrinterId(localStorage.getItem("pairedPrinterId") || "");
  }, []);

  const onSubmit = (data: PosPrinterFormData) => {
    if (!editingPrinter) {
      createMutation.mutate(data as any);
      return;
    }

    const current = editingPrinter;
    const normalize = (v: unknown) => (v == null ? "" : String(v).trim());
    const criticalChanges: Array<{ field: string; from: string; to: string }> = [];
    const pushIfChanged = (label: string, from: unknown, to: unknown) => {
      const a = normalize(from);
      const b = normalize(to);
      if (a !== b) criticalChanges.push({ field: label, from: a || "—", to: b || "—" });
    };

    pushIfChanged("Type", current.type, data.type);
    pushIfChanged("Driver", current.thermalDriver, data.thermalDriver);
    pushIfChanged("IP Address", current.ipAddress, data.ipAddress);
    pushIfChanged("Port", current.port, data.port);
    pushIfChanged("ePOS URL", current.eposUrl, data.eposUrl);
    pushIfChanged("USB Vendor ID", current.usbVendorId, data.usbVendorId);
    pushIfChanged("USB Product ID", current.usbProductId, data.usbProductId);
    pushIfChanged("Bluetooth Address", current.bluetoothAddress, data.bluetoothAddress);
    pushIfChanged("Location", current.location || "", data.location || "");

    if (!criticalChanges.length) {
      updateMutation.mutate({ id: editingPrinter._id, data: data as any });
      return;
    }

    setPendingSubmitData(data);
    setReviewChanges(criticalChanges);
    setReviewConfirmText("");
    setReviewOpen(true);
  };

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Are you sure you want to remove printer "${name}"?`)) {
      deleteMutation.mutate(id);
    }
  };

  const handleCheckStatus = useCallback(async (printerId: string, options?: { silent?: boolean }) => {
    try {
      setCheckingStatusByPrinterId((prev) => ({ ...prev, [printerId]: true }));
      const res = await posGetPrinterStatus(printerId);
      const payload = res?.data;
      if (!payload) {
        toast.error("Printer status response was empty.");
        return;
      }
      setStatusByPrinterId((prev) => ({
        ...prev,
        [printerId]: {
          online: !!payload.online,
          detail: payload.detail || "Unknown",
          lastCheckedAt: payload.lastCheckedAt,
        },
      }));
      if (!options?.silent) {
        toast.success(payload.online ? "Printer is reachable." : "Printer is offline/unreachable.");
      }
    } catch (err: unknown) {
      if (!options?.silent) {
        const message = err instanceof Error ? err.message : "Failed to check printer status.";
        toast.error(message);
      }
    } finally {
      setCheckingStatusByPrinterId((prev) => ({ ...prev, [printerId]: false }));
    }
  }, []);

  useEffect(() => {
    if (!printers.length) return;
    let cancelled = false;
    const run = async () => {
      await Promise.all(
        printers.map(async (printer) => {
          if (cancelled) return;
          await handleCheckStatus(printer._id, { silent: true });
        }),
      );
    };
    void run();
    const intervalId = window.setInterval(() => {
      void run();
    }, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [printers, handleCheckStatus]);

  useEffect(() => {
    if (!isPrintingSupported()) return;
    let cancelled = false;
    const refresh = async () => {
      const preferred = typeof window !== "undefined" ? localStorage.getItem("pairedPrinterName") || "" : "";
      await autoReconnectBluetoothPrinter(preferred);
      if (cancelled) return;
      const state = getBluetoothConnectionState();
      setTerminalBluetoothConnected(state.connected);
    };
    void refresh();
    const intervalId = window.setInterval(() => {
      const state = getBluetoothConnectionState();
      setTerminalBluetoothConnected(state.connected);
    }, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  const canAutoDetectBluetooth = isPrintingSupported();

  /** Explains why Auto-Detect Bluetooth is unavailable (secure context, browser, or API missing). */
  const webBluetoothEnvironmentHint = useMemo((): string | null => {
    const w = globalThis.window;
    if (typeof w === "undefined") return null;
    if (!w.isSecureContext) {
      return 'Web Bluetooth requires a secure context. Use HTTPS, or open the app over loopback in development—not plain http://<LAN-IP>. If the app is embedded in a frame, the page needs Permissions-Policy / allow="bluetooth".';
    }
    if (!w.navigator.bluetooth) {
      return "This browser does not expose the Web Bluetooth API. Use a recent Chrome or Edge (desktop), or use Settings → Bluetooth Printer on a supported terminal.";
    }
    return null;
  }, []);

  const bluetoothBindingLabel = useMemo(() => {
    if (!canAutoDetectBluetooth) return "Web Bluetooth unsupported in this browser";
    if (!pairedBluetoothPrinterId) return "No terminal-to-printer mapping selected";
    return terminalBluetoothConnected ? "Terminal Bluetooth connected" : "Terminal Bluetooth disconnected";
  }, [canAutoDetectBluetooth, pairedBluetoothPrinterId, terminalBluetoothConnected]);

  const handleAutoDetectBluetooth = async () => {
    if (!canAutoDetectBluetooth) {
      toast.error("Web Bluetooth is not available in this browser.");
      return;
    }
    setDetectingBluetooth(true);
    try {
      const res = await requestBluetoothPrinter();
      const detectedName = res.device.name || "Bluetooth printer";
      const currentName = watch("name");
      if (!editingPrinter) {
        if (!currentName?.trim()) {
          setValue("name", detectedName, { shouldDirty: true, shouldValidate: true });
        }
        setValue("type", "bluetooth", { shouldDirty: true, shouldValidate: true });
      } else {
        toast.message("Detected on terminal. Existing printer routing/location fields were not modified.");
      }
      if (!watch("bluetoothAddress")) {
        setValue("bluetoothAddress", "", { shouldDirty: true, shouldValidate: true });
      }
      localStorage.setItem("pairedPrinterName", detectedName);
      setTerminalBluetoothConnected(true);
      toast.success(`Detected ${detectedName}. Type switched to Bluetooth.`);
    } catch (err: any) {
      toast.error(err.message || "Bluetooth detection failed.");
    } finally {
      setDetectingBluetooth(false);
    }
  };

  const handleBackendDiscovery = async () => {
    setDiscoveringBackend(true);
    try {
      const res = await posDiscoverPrinters("all");
      const payload = res.data;
      if (!payload) throw new Error("Discovery payload is empty.");
      setBackendDiscoveryItems(Array.isArray(payload.items) ? payload.items : []);
      setBackendDiscoveryMeta({
        scannedAt: payload.scannedAt,
        online: payload.online,
        offline: payload.offline,
      });
      toast.success(`Discovery completed: ${payload.online}/${payload.total} reachable.`);
    } catch (err: any) {
      toast.error(err.message || "Backend discovery failed.");
    } finally {
      setDiscoveringBackend(false);
    }
  };

  const getPrinterIcon = (type: string) => {
    switch (type) {
      case "network":
        return <Wifi className="h-4 w-4" />;
      case "usb":
        return <Usb className="h-4 w-4" />;
      case "epson-epos":
        return <Cpu className="h-4 w-4" />;
      case "bluetooth":
        return <PrinterIcon className="h-4 w-4" />;
      default:
        return <PrinterIcon className="h-4 w-4" />;
    }
  };

  const discoveryByPrinterId = useMemo(() => {
    const map = new Map<string, PosPrinterDiscoveryItem>();
    for (const item of backendDiscoveryItems) map.set(item.printerId, item);
    return map;
  }, [backendDiscoveryItems]);

  const editingCategoryCount = useMemo(() => {
    if (!editingPrinter) return 0;
    return discoveryByPrinterId.get(editingPrinter._id)?.categoryCount || 0;
  }, [discoveryByPrinterId, editingPrinter]);

  const canConfirmReview = useMemo(() => {
    if (!editingPrinter) return false;
    if (editingCategoryCount <= 0) return true;
    return reviewConfirmText.trim() === editingPrinter.name.trim();
  }, [editingCategoryCount, editingPrinter, reviewConfirmText]);

  const submitReviewedChanges = () => {
    if (!editingPrinter || !pendingSubmitData || !canConfirmReview) return;
    updateMutation.mutate({ id: editingPrinter._id, data: pendingSubmitData as any });
    setReviewOpen(false);
    setPendingSubmitData(null);
    setReviewChanges([]);
    setReviewConfirmText("");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-bold text-3xl text-foreground tracking-tight">Hardware: Printers</h1>
          <p className="mt-1 text-muted-foreground">
            Configure Kitchen, Receipt, and Label printers for local or cloud printing.
          </p>
          <p className="mt-1 text-muted-foreground text-xs">
            Status is auto-checked every 30s. Use manual check for immediate refresh.
          </p>
        </div>
        <Button onClick={() => handleOpenDialog()} className="gap-2">
          <Plus className="h-4 w-4" /> Add Printer
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Auto-Detect Assistant</CardTitle>
          <CardDescription>
            Bluetooth can be detected from this terminal. Network and USB still require backend-side discovery tools.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md border border-amber-900/40 bg-amber-950/20 px-3 py-2 text-amber-100/90 text-xs">
            Safety mode: discovery does <strong>not</strong> auto-change printer routing fields (location/category
            mapping). Operators must review and save intentionally.
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant={canAutoDetectBluetooth ? "default" : "destructive"}>
              Bluetooth {canAutoDetectBluetooth ? "Supported" : "Unavailable"}
            </Badge>
            <Badge variant="secondary">Network: Manual/Backend probe</Badge>
            <Badge variant="secondary">USB: Backend host detection</Badge>
          </div>
          {webBluetoothEnvironmentHint ? (
            <div className="rounded-md border border-sky-900/50 bg-sky-950/25 px-3 py-2 text-sky-100/90 text-xs leading-relaxed">
              {webBluetoothEnvironmentHint}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              className="gap-2"
              onClick={handleAutoDetectBluetooth}
              disabled={!canAutoDetectBluetooth || detectingBluetooth}
            >
              {detectingBluetooth ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
              Auto-Detect Bluetooth
            </Button>
            <Button variant="outline" className="gap-2" onClick={handleBackendDiscovery} disabled={discoveringBackend}>
              {discoveringBackend ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Run Backend Discovery
            </Button>
            <span className="text-muted-foreground text-xs">{bluetoothBindingLabel}</span>
          </div>
          {backendDiscoveryMeta.scannedAt ? (
            <div className="text-muted-foreground text-xs">
              Last backend scan: {format(new Date(backendDiscoveryMeta.scannedAt), "PPpp")} · Reachable:{" "}
              {backendDiscoveryMeta.online ?? 0} · Unreachable: {backendDiscoveryMeta.offline ?? 0}
            </div>
          ) : null}
          {backendDiscoveryItems.length ? (
            <div className="space-y-2 rounded-md border p-3">
              {backendDiscoveryItems.map((item) => (
                <div key={item.printerId} className="flex items-center justify-between gap-3 text-sm">
                  <div>
                    <div className="font-medium">{item.name}</div>
                    <div className="text-muted-foreground text-xs">
                      {item.type} · {item.detail}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                      <Badge variant="secondary">
                        {item.locationName ? `Location: ${item.locationName}` : "Location: All / Unscoped"}
                      </Badge>
                      <Badge variant="secondary">Categories: {item.categoryCount ?? 0}</Badge>
                      {!item.online && (item.categoryCount ?? 0) > 0 ? (
                        <Badge variant="destructive">Routing impact risk</Badge>
                      ) : null}
                    </div>
                  </div>
                  <Badge variant={item.online ? "default" : "destructive"}>
                    {item.online ? "Reachable" : "Unreachable"}
                  </Badge>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {isLoadingPrinters ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[200px] w-full rounded-xl" />)
        ) : printers.length === 0 ? (
          <div className="col-span-full flex flex-col items-center justify-center rounded-xl border-2 border-dashed bg-card py-12">
            <PrinterIcon className="mb-4 h-12 w-12 text-muted-foreground/30" />
            <h3 className="font-semibold text-xl">No Printers Configured</h3>
            <p className="text-muted-foreground text-sm">Add your first network or cloud printer to get started.</p>
          </div>
        ) : (
          printers.map((printer) => (
            <Card key={printer._id} className="group relative overflow-hidden">
              <div className="absolute top-0 left-0 h-full w-1 bg-primary" />
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="gap-1 font-normal capitalize">
                    {getPrinterIcon(printer.type)}
                    {printer.type}
                  </Badge>
                  <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleOpenDialog(printer)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => handleDelete(printer._id, printer.name)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <CardTitle className="mt-2 text-lg">{printer.name}</CardTitle>
                <CardDescription className="font-mono text-[10px] uppercase tracking-tighter">
                  ID: {printer._id.slice(-8)}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5 border-t pt-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Driver:</span>
                    <span className="font-medium capitalize">{printer.thermalDriver}</span>
                  </div>
                  {printer.ipAddress && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Target:</span>
                      <span className="font-medium">
                        {printer.ipAddress}:{printer.port || 9100}
                      </span>
                    </div>
                  )}
                  {printer.eposUrl && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">ePOS URL:</span>
                      <span className="max-w-[150px] truncate font-medium">{printer.eposUrl}</span>
                    </div>
                  )}
                  {printer.usbVendorId && printer.usbProductId && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">USB:</span>
                      <span className="font-medium">
                        {printer.usbVendorId}:{printer.usbProductId}
                      </span>
                    </div>
                  )}
                  {printer.bluetoothAddress && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Bluetooth:</span>
                      <span className="font-medium">{printer.bluetoothAddress}</span>
                    </div>
                  )}
                  {printer.type === "bluetooth" && pairedBluetoothPrinterId === printer._id && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Terminal Link:</span>
                      <Badge variant={terminalBluetoothConnected ? "default" : "destructive"}>
                        {terminalBluetoothConnected ? "Connected" : "Disconnected"}
                      </Badge>
                    </div>
                  )}
                  {statusByPrinterId[printer._id] && (
                    <div className="rounded-md border p-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Status:</span>
                        <Badge variant={statusByPrinterId[printer._id].online ? "default" : "destructive"}>
                          {statusByPrinterId[printer._id].online ? "Online" : "Offline"}
                        </Badge>
                      </div>
                      <p className="mt-1 text-muted-foreground">{statusByPrinterId[printer._id].detail}</p>
                      {statusByPrinterId[printer._id].lastCheckedAt && (
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          Last checked:{" "}
                          {format(new Date(statusByPrinterId[printer._id].lastCheckedAt as string), "PPpp")}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-full text-xs"
                    onClick={() => testPrintMutation.mutate(printer._id)}
                    disabled={testPrintMutation.isPending}
                  >
                    {testPrintMutation.isPending ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-1 h-3 w-3" />
                    )}
                    Test Print
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-8 w-full text-xs"
                    onClick={() => handleCheckStatus(printer._id)}
                    disabled={!!checkingStatusByPrinterId[printer._id]}
                  >
                    {checkingStatusByPrinterId[printer._id] ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : (
                      <Activity className="mr-1 h-3 w-3" />
                    )}
                    {checkingStatusByPrinterId[printer._id] ? "Checking..." : "Check Status"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingPrinter ? "Update Printer" : "Register New Printer"}</DialogTitle>
            <DialogDescription>Configure the connection and capabilities of your thermal hardware.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-2">
                <Label htmlFor="pname">Printer Label / Station</Label>
                <Input id="pname" {...register("name")} placeholder="e.g. Main Kitchen, Bar Printer" />
                {errors.name && <p className="text-destructive text-xs">{errors.name.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="ptype">Connection Type</Label>
                <Controller
                  control={control}
                  name="type"
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger id="ptype">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="network">Network (IP)</SelectItem>
                        <SelectItem value="usb">USB (Local)</SelectItem>
                        <SelectItem value="bluetooth">Bluetooth (Terminal)</SelectItem>
                        <SelectItem value="epson-epos">Epson ePOS (Cloud)</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              {watch("type") !== "epson-epos" && (
                <div className="space-y-2">
                  <Label htmlFor="pdriver">Internal Driver</Label>
                  <Controller
                    control={control}
                    name="thermalDriver"
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger id="pdriver">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="epson">Epson ESC/POS</SelectItem>
                          <SelectItem value="star">Star</SelectItem>
                          <SelectItem value="tanca">Tanca</SelectItem>
                          <SelectItem value="daruma">Daruma</SelectItem>
                          <SelectItem value="brother">Brother</SelectItem>
                          <SelectItem value="custom">Custom</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              )}

              {watch("type") === "network" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="pip">IP Address</Label>
                    <Input id="pip" {...register("ipAddress")} placeholder="192.168.1.100" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pport">Port</Label>
                    <Input id="pport" type="number" {...register("port", { valueAsNumber: true })} />
                  </div>
                </>
              )}

              {watch("type") === "epson-epos" && (
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="pepos">ePOS Print Service URL</Label>
                  <Input
                    id="pepos"
                    {...register("eposUrl")}
                    placeholder="http://192.168.1.x/cgi-bin/epos/service.cgi"
                  />
                </div>
              )}

              {watch("type") === "usb" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="usbVendorId">USB Vendor ID (hex)</Label>
                    <Input id="usbVendorId" {...register("usbVendorId")} placeholder="04b8" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="usbProductId">USB Product ID (hex)</Label>
                    <Input id="usbProductId" {...register("usbProductId")} placeholder="0e15" />
                  </div>
                </>
              )}

              {watch("type") === "bluetooth" && (
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="bluetoothAddress">Bluetooth Address (optional)</Label>
                  <Input id="bluetoothAddress" {...register("bluetoothAddress")} placeholder="AA:BB:CC:DD:EE:FF" />
                  <p className="text-muted-foreground text-xs">
                    Browser Web Bluetooth usually does not expose MAC addresses. Use Auto-Detect to pair this terminal.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-1"
                    onClick={handleAutoDetectBluetooth}
                    disabled={!canAutoDetectBluetooth || detectingBluetooth}
                  >
                    {detectingBluetooth ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Detect Bluetooth Device
                  </Button>
                </div>
              )}

              <div className="col-span-2 space-y-2">
                <Label htmlFor="ploc">Assign to Location (Optional)</Label>
                <Controller
                  control={control}
                  name="location"
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value || "null"}>
                      <SelectTrigger id="ploc">
                        <SelectValue placeholder="All Locations" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="null">All Locations</SelectItem>
                        {locations.map((loc) => (
                          <SelectItem key={loc._id} value={loc._id}>
                            {loc.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>

            <DialogFooter className="border-t pt-4">
              <Button type="button" variant="ghost" onClick={handleCloseDialog}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {(createMutation.isPending || updateMutation.isPending) && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {editingPrinter ? "Save Changes" : "Register Printer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Review Printer Changes</DialogTitle>
            <DialogDescription>Confirm connectivity and routing-sensitive changes before applying.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-md border px-3 py-2 text-xs">
              <div className="font-medium">Change set</div>
              <div className="mt-2 space-y-2">
                {reviewChanges.map((change) => (
                  <div key={`${change.field}:${change.from}:${change.to}`} className="grid grid-cols-[140px_1fr] gap-2">
                    <div className="text-muted-foreground">{change.field}</div>
                    <div>
                      <span className="text-red-400/90">{change.from}</span>
                      <span className="mx-2 text-muted-foreground">→</span>
                      <span className="text-emerald-400/90">{change.to}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {editingCategoryCount > 0 ? (
              <div className="space-y-2 rounded-md border border-amber-800/40 bg-amber-950/20 px-3 py-2 text-amber-100/90 text-xs">
                <p>
                  This printer is assigned to <strong>{editingCategoryCount}</strong> category routes. A wrong
                  IP/port/type/location can break kitchen routing.
                </p>
                <div className="space-y-1">
                  <Label htmlFor="reviewConfirmText" className="text-amber-100 text-xs">
                    Type printer name to confirm ({editingPrinter?.name}):
                  </Label>
                  <Input
                    id="reviewConfirmText"
                    value={reviewConfirmText}
                    onChange={(e) => setReviewConfirmText(e.target.value)}
                    placeholder={editingPrinter?.name || ""}
                  />
                </div>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setReviewOpen(false);
                setPendingSubmitData(null);
                setReviewChanges([]);
                setReviewConfirmText("");
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={submitReviewedChanges}
              disabled={!canConfirmReview || updateMutation.isPending}
            >
              {updateMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirm & Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
