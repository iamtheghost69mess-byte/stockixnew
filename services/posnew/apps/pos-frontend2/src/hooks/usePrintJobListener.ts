"use client";

import { useEffect } from "react";

import { sendTicketData, type TicketData } from "@/lib/bluetooth-printer";
import { posApiJson } from "@/lib/pos-api-fetch";
import { acquirePosSocket, releasePosSocket } from "@/lib/pos-socket";

type PrintSocketPayload = {
  printJobId: string;
  ticketData: TicketData;
};

export function usePrintJobListener() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const printerId = localStorage.getItem("pairedPrinterId");
    if (!printerId) return;

    const socket = acquirePosSocket();
    socket.emit("printer:register", { printerId });
    const processed = new Set<string>();

    const processJob = async (payload: PrintSocketPayload) => {
      if (!payload?.printJobId || processed.has(payload.printJobId)) return;
      processed.add(payload.printJobId);
      try {
        await sendTicketData(payload.ticketData);
        socket.emit("print:ack", { printJobId: payload.printJobId, status: "done" });
      } catch (e) {
        socket.emit("print:ack", {
          printJobId: payload.printJobId,
          status: "failed",
          error: e instanceof Error ? e.message : String(e),
        });
      }
    };

    const onPrintJob = (payload: PrintSocketPayload) => {
      void processJob(payload);
    };
    socket.on("print:job", onPrintJob);

    const interval = setInterval(async () => {
      try {
        const res = await posApiJson<any[]>(
          `/api/print-jobs?printerId=${encodeURIComponent(printerId)}&status=pending`,
        );
        const rows = Array.isArray(res.data) ? res.data : [];
        for (const row of rows) {
          if (!row?._id || !row?.ticketData) continue;
          await processJob({
            printJobId: String(row._id),
            ticketData: row.ticketData as TicketData,
          });
        }
      } catch {
        // silent fallback polling failure
      }
    }, 30000);

    return () => {
      clearInterval(interval);
      socket.off("print:job", onPrintJob);
      releasePosSocket();
    };
  }, []);
}
