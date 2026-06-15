"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "@/components/reusabletoast";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useHasPermission } from "@/hooks/use-permissions";
import { formatApiError } from "@/lib/api-errors";

type PlatformRole = {
  id: string;
  name: string;
  slug: string;
  isSystem: boolean;
  permissions: string[];
};

export default function PlatformRolesPage() {
  const canManage = useHasPermission("roles.manage");
  const [roles, setRoles] = useState<PlatformRole[]>([]);
  const [allPermissions, setAllPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newPerms, setNewPerms] = useState<string[]>(["tenants.read"]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/roles");
      const data = (await res.json()) as {
        roles?: PlatformRole[];
        allPermissions?: string[];
        error?: string;
      };
      if (!res.ok) throw new Error(formatApiError(data, "Failed to load roles"));
      setRoles(data.roles ?? []);
      setAllPermissions(data.allPermissions ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load roles");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canManage) void load();
  }, [canManage, load]);

  async function saveRole(role: PlatformRole, permissions: string[]) {
    const res = await fetch(`/api/admin/roles/${role.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ permissions }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(formatApiError(data, "Failed to update role"));
      return;
    }
    toast.success(`Updated ${role.name}`);
    void load();
  }

  async function createRole() {
    const res = await fetch("/api/admin/roles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: newName, slug: newSlug, permissions: newPerms }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(formatApiError(data, "Failed to create role"));
      return;
    }
    toast.success("Role created");
    setNewName("");
    setNewSlug("");
    void load();
  }

  if (!canManage) {
    return (
      <p className="text-muted-foreground text-sm p-6">You do not have permission to manage roles.</p>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Platform roles</h1>
        <p className="text-muted-foreground text-sm">
          Custom roles and permission matrix for owner dashboard access.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Create custom role</CardTitle>
          <CardDescription>Slug must be lowercase with underscores (e.g. finance_viewer).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="role-name">Name</Label>
              <Input id="role-name" value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role-slug">Slug</Label>
              <Input id="role-slug" value={newSlug} onChange={(e) => setNewSlug(e.target.value)} />
            </div>
          </div>
          <Button type="button" onClick={() => void createRole()} disabled={!newName || !newSlug}>
            Create role
          </Button>
        </CardContent>
      </Card>

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading roles…</p>
      ) : (
        roles.map((role) => (
          <Card key={role.id}>
            <CardHeader>
              <CardTitle className="text-lg">
                {role.name}{" "}
                <span className="text-muted-foreground font-normal text-sm">({role.slug})</span>
              </CardTitle>
              {role.isSystem ? (
                <CardDescription>System role — permissions can be edited with care.</CardDescription>
              ) : null}
            </CardHeader>
            <CardContent>
              <RolePermissionGrid
                role={role}
                allPermissions={allPermissions}
                onSave={(perms) => void saveRole(role, perms)}
              />
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

function RolePermissionGrid({
  role,
  allPermissions,
  onSave,
}: {
  role: PlatformRole;
  allPermissions: string[];
  onSave: (perms: string[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>(role.permissions);

  useEffect(() => {
    setSelected(role.permissions);
  }, [role.permissions]);

  function toggle(p: string) {
    setSelected((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {allPermissions.map((p) => (
          <label key={p} className="flex items-center gap-2 text-sm">
            <Checkbox checked={selected.includes(p)} onCheckedChange={() => toggle(p)} />
            <span className="font-mono text-xs">{p}</span>
          </label>
        ))}
      </div>
      <Button type="button" size="sm" onClick={() => onSave(selected)}>
        Save permissions
      </Button>
    </div>
  );
}
