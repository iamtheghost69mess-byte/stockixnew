"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { PosPageShell } from "@/components/pos-page-shell";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { posApiFetch } from "@/lib/pos-fetch";

type PosOrg = {
  id?: string;
  _id?: string;
  name?: string;
  slug?: string;
  status?: string;
};

export default function PosOrganizationsPage() {
  const [rows, setRows] = useState<PosOrg[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await posApiFetch("organizations");
      const data = (await res.json()) as { organizations?: PosOrg[]; data?: PosOrg[] };
      if (!res.ok) {
        setError(JSON.stringify(data));
        return;
      }
      const list = data.organizations ?? data.data ?? (Array.isArray(data) ? data : []);
      setRows(Array.isArray(list) ? list : []);
    })();
  }, []);

  return (
    <PosPageShell title="POS organizations" description="MongoDB organizations managed by the POS platform API.">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Slug</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-[80px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((org) => {
            const id = org.id ?? org._id ?? "";
            return (
              <TableRow key={id}>
                <TableCell>{org.name ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs">{org.slug ?? "—"}</TableCell>
                <TableCell>{org.status ?? "—"}</TableCell>
                <TableCell>
                  {id ? (
                    <Link href={`/pos/organizations/${id}`} className="text-sm text-primary hover:underline">
                      View
                    </Link>
                  ) : null}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </PosPageShell>
  );
}
