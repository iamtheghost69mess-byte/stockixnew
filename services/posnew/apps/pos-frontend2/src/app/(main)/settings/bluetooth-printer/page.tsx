"use client";

import { useEffect, useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  autoReconnectBluetoothPrinter,
  disconnectPrinter,
  getBluetoothConnectionState,
  isPrintingSupported,
  requestBluetoothPrinter,
  sendTicketData,
} from "@/lib/bluetooth-printer";
import { posFetchPrinters } from "@/lib/pos-printer-api";

export default function BluetoothPrinterSettingsPage() {
  const [pairedPrinterName, setPairedPrinterName] = useState("");
  const [pairedPrinterId, setPairedPrinterId] = useState("");
  const [paperWidth, setPaperWidth] = useState("58");
  const [connectionStatus, setConnectionStatus] = useState<"connected" | "disconnected" | "not-supported">(
    isPrintingSupported() ? "disconnected" : "not-supported",
  );

  const { data } = useQuery({
    queryKey: ["printer-list"],
    queryFn: posFetchPrinters,
  });
  const printers = Array.isArray(data?.data) ? data.data.filter((p) => p.type === "bluetooth") : [];

  useEffect(() => {
    if (typeof window === "undefined") return;
    setPairedPrinterName(localStorage.getItem("pairedPrinterName") || "");
    setPairedPrinterId(localStorage.getItem("pairedPrinterId") || "");
    setPaperWidth(localStorage.getItem("printerWidth") || "58");
  }, []);

  useEffect(() => {
    if (!isPrintingSupported()) {
      setConnectionStatus("not-supported");
      return;
    }
    let cancelled = false;
    const detect = async () => {
      const preferred = typeof window !== "undefined" ? localStorage.getItem("pairedPrinterName") || "" : "";
      const restored = await autoReconnectBluetoothPrinter(preferred);
      if (cancelled) return;
      const state = getBluetoothConnectionState();
      if (restored || state.connected) {
        setConnectionStatus("connected");
        if (state.deviceName && state.deviceName !== pairedPrinterName) {
          setPairedPrinterName(state.deviceName);
          localStorage.setItem("pairedPrinterName", state.deviceName);
        }
      } else {
        setConnectionStatus("disconnected");
      }
    };
    void detect();
    const intervalId = window.setInterval(() => {
      const state = getBluetoothConnectionState();
      setConnectionStatus(state.connected ? "connected" : "disconnected");
    }, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [pairedPrinterName]);

  const selectedPrinterName = useMemo(() => {
    return printers.find((p) => p._id === pairedPrinterId)?.name || pairedPrinterName;
  }, [pairedPrinterId, pairedPrinterName, printers]);

  const pairNewPrinter = async () => {
    try {
      const res = await requestBluetoothPrinter();
      const name = res.device.name || "Bluetooth printer";
      setPairedPrinterName(name);
      localStorage.setItem("pairedPrinterName", name);
      setConnectionStatus("connected");
      toast.success(`Paired with ${name}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to pair printer.");
      setConnectionStatus(isPrintingSupported() ? "disconnected" : "not-supported");
    }
  };

  const testPrint = async () => {
    try {
      await sendTicketData({
        tableNumber: "TEST",
        orderShortId: "BT-TEST",
        stationName: "Bluetooth Station",
        timestamp: new Date().toISOString(),
        items: [
          { name: "Printer test line", qty: 1, note: "Web Bluetooth OK" },
          { name: "Second item", qty: 2 },
        ],
      });
      toast.success("Test print sent.");
      setConnectionStatus("connected");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test print failed.");
      setConnectionStatus(isPrintingSupported() ? "disconnected" : "not-supported");
    }
  };

  const forgetPrinter = () => {
    disconnectPrinter();
    localStorage.removeItem("pairedPrinterName");
    localStorage.removeItem("pairedPrinterId");
    localStorage.removeItem("printerWidth");
    setPairedPrinterName("");
    setPairedPrinterId("");
    setPaperWidth("58");
    setConnectionStatus(isPrintingSupported() ? "disconnected" : "not-supported");
    toast.success("Bluetooth printer settings cleared.");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-bold text-3xl tracking-tight">Bluetooth Printer Setup</h1>
        <p className="mt-1 text-muted-foreground">
          Pair this terminal with a Bluetooth printer and map it to a backend printer record.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Connection</CardTitle>
          <CardDescription>
            Status:{" "}
            {connectionStatus === "not-supported"
              ? "Not Supported"
              : connectionStatus === "connected"
                ? "Connected"
                : "Disconnected"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Paired Device</Label>
            <Input value={selectedPrinterName || "None"} readOnly />
          </div>

          <div className="space-y-2">
            <Label>Backend Bluetooth Printer Mapping</Label>
            <Select
              value={pairedPrinterId || "none"}
              onValueChange={(v) => {
                const next = v === "none" ? "" : v;
                setPairedPrinterId(next);
                if (next) localStorage.setItem("pairedPrinterId", next);
                else localStorage.removeItem("pairedPrinterId");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select backend printer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unmapped</SelectItem>
                {printers.map((p) => (
                  <SelectItem key={p._id} value={p._id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Paper Width</Label>
            <Select
              value={paperWidth}
              onValueChange={(v) => {
                setPaperWidth(v);
                localStorage.setItem("printerWidth", v);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="58">58mm</SelectItem>
                <SelectItem value="80">80mm</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={pairNewPrinter} disabled={!isPrintingSupported()}>
              Pair New Printer
            </Button>
            <Button variant="secondary" onClick={testPrint} disabled={!isPrintingSupported()}>
              Test Print
            </Button>
            <Button variant="destructive" onClick={forgetPrinter}>
              Forget Printer
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
