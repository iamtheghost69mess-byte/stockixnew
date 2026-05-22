"use client";

import { useCallback, useEffect, useState } from "react";

import { PosPageShell } from "@/components/pos-page-shell";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { posApiFetch } from "@/lib/pos-fetch";

type PosDevice = {
  id?: string;
  _id?: string;
  name?: string;
  status?: string;
  organizationId?: string;
};

export default function PosDevicesPage() {
  const [rows, setRows] = useState<PosDevice[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await posApiFetch("devices");
    const data = (await res.json()) as { devices?: PosDevice[]; data?: PosDevice[] };
    if (!res.ok) {
      setError(JSON.stringify(data));
      return;
    }
    const list = data.devices ?? data.data ?? (Array.isArray(data) ? data : []);
    setRows(Array.isArray(list) ? list : []);
    setError(null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const approve = async (id: string) => {
    await posApiFetch(`devices/${id}/approve`, { method: "POST" });
    await load();
  };

  const revoke = async (id: string) => {
    await posApiFetch(`devices/${id}`, { method: "DELETE" });
    await load();
  };

  return (
    <PosPageShell title="POS devices" description="Terminal devices — approve or revoke access.">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Organization</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((device) => {
            const id = device.id ?? device._id ?? "";
            return (
              <TableRow key={id}>
                <TableCell>{device.name ?? id}</TableCell>
                <TableCell>{device.status ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs">{device.organizationId ?? "—"}</TableCell>
                <TableCell className="space-x-2 text-right">
                  <Button size="sm" variant="outline" onClick={() => void approve(id)}>
                    Approve
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => void revoke(id)}>
                    Revoke
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </PosPageShell>
  );
}
