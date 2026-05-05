"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Loader2, Plus, Trash2, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Owner = {
  id: string;
  email: string;
  name: string;
  role: "super_admin" | "support_agent" | "billing_manager" | "read_only";
  passwordHash?: string | null;
  createdAt: string;
};

export default function OwnersPage() {
  const [owners, setOwners] = useState<Owner[]>([]);
  const [loadErr, setLoadErr] = useState("");
  const [loading, setLoading] = useState(true);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [addErr, setAddErr] = useState("");

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteErr, setDeleteErr] = useState("");
  const [inviteRole, setInviteRole] = useState<Owner["role"]>("read_only");
  const [inviteUrl, setInviteUrl] = useState("");
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadErr("");
    try {
      const res = await fetch("/api/owners");
      const data = (await res.json()) as { owners?: Owner[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setOwners(data.owners ?? []);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddErr("");
    setAdding(true);
    try {
      const res = await fetch("/api/owners/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, role: inviteRole }),
      });
      const data = (await res.json()) as { owner?: Owner; inviteUrl?: string; error?: string };
      if (!res.ok) {
        setAddErr(
          data.error === "email_already_exists"
            ? "An owner with that email already exists."
            : (data.error ?? `HTTP ${res.status}`),
        );
        return;
      }
      setEmail("");
      setName("");
      setInviteUrl(data.inviteUrl ?? "");
      setCopiedInvite(false);
      setInviteOpen(false);
      await load();
    } catch (e) {
      setAddErr(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(false);
    }
  }

  async function copyInviteUrl() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopiedInvite(true);
      window.setTimeout(() => setCopiedInvite(false), 2000);
    } catch {
      setAddErr("Could not copy invite link.");
    }
  }

  function roleBadgeClass(role: Owner["role"]) {
    switch (role) {
      case "super_admin":
        return "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-200";
      case "support_agent":
        return "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-200";
      case "billing_manager":
        return "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-200";
      case "read_only":
      default:
        return "border-muted-foreground/30 bg-muted text-muted-foreground";
    }
  }

  async function handleDelete(owner: Owner) {
    if (
      !confirm(
        `Delete owner "${owner.name}" (${owner.email})?\n\nThis will fail if they still have tenants assigned.`,
      )
    )
      return;
    setDeleteErr("");
    setDeletingId(owner.id);
    try {
      const res = await fetch(`/api/owners/${owner.id}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { error?: string; detail?: string };
      if (!res.ok) {
        setDeleteErr(data.detail ?? data.error ?? `HTTP ${res.status}`);
        return;
      }
      await load();
    } catch (e) {
      setDeleteErr(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Owners</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Platform administrators who can have tenants assigned to them.
        </p>
      </div>

      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Invite platform admins with role-based access.
          </p>
          <Button type="button" className="gap-2" onClick={() => setInviteOpen(true)}>
            <Plus className="h-4 w-4" />
            Invite Admin
          </Button>
        </div>
        {addErr && <p className="text-sm text-destructive">{addErr}</p>}
        {inviteUrl && (
          <div className="flex items-center gap-2">
            <p className="text-xs text-muted-foreground break-all">
              Invite link: {inviteUrl}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => void copyInviteUrl()}
            >
              <Copy className="mr-1 h-3 w-3" />
              {copiedInvite ? "Copied" : "Copy"}
            </Button>
          </div>
        )}
      </div>

      {inviteOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
          <div className="w-full max-w-xl rounded-lg border bg-background p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-base font-semibold">Invite Admin</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Create an invite link for a new platform owner.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setInviteOpen(false)}
              >
                Close
              </Button>
            </div>
            <form
              onSubmit={handleAdd}
              className="flex flex-wrap items-end gap-3"
            >
        <div className="flex-1 min-w-[180px] space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Email
          </label>
          <Input
            type="email"
            placeholder="owner@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Role</label>
          <select
            className="flex h-9 rounded-lg border border-input bg-background px-2 text-sm"
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as Owner["role"])}
          >
            <option value="super_admin">super_admin</option>
            <option value="support_agent">support_agent</option>
            <option value="billing_manager">billing_manager</option>
            <option value="read_only">read_only</option>
          </select>
        </div>
        <div className="flex-1 min-w-[180px] space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Name
          </label>
          <Input
            type="text"
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <Button type="submit" disabled={adding} className="gap-2">
          {adding ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Send Invite
        </Button>
            </form>
          </div>
        </div>
      ) : null}

      {/* Owner list */}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading owners…
        </div>
      ) : loadErr ? (
        <p className="text-sm text-destructive">{loadErr}</p>
      ) : owners.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-12 text-center">
          <Users className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            No owners yet. Add one above.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border">
          {deleteErr && (
            <p className="border-b px-4 py-2 text-sm text-destructive">
              {deleteErr}
            </p>
          )}
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                  Name
                </th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                  Email
                </th>
                <th className="hidden px-4 py-2 text-left font-medium text-muted-foreground sm:table-cell">
                  ID
                </th>
                <th className="hidden px-4 py-2 text-left font-medium text-muted-foreground md:table-cell">
                  Role
                </th>
                <th className="hidden px-4 py-2 text-left font-medium text-muted-foreground md:table-cell">
                  Status
                </th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {owners.map((o, i) => (
                <tr
                  key={o.id}
                  className={i < owners.length - 1 ? "border-b" : ""}
                >
                  <td className="px-4 py-3 font-medium">{o.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {o.email}
                  </td>
                  <td className="hidden px-4 py-3 font-mono text-xs text-muted-foreground sm:table-cell">
                    {o.id.slice(0, 8)}…
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${roleBadgeClass(
                        o.role,
                      )}`}
                    >
                      {o.role}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                        o.passwordHash
                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200"
                          : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-200"
                      }`}
                    >
                      {o.passwordHash ? "activated" : "pending"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(o)}
                      disabled={deletingId === o.id}
                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                    >
                      {deletingId === o.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
