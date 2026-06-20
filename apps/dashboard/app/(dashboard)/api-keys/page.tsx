"use client";

import { useCallback, useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { CopyIcon, PlusIcon, Trash2Icon } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/alert-dialog";
import { Button } from "@repo/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/dialog";
import { Input } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/table";
import { useMe } from "@/hooks/use-me";
import { formatApiError } from "@/lib/api-errors";

type ApiKeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  createdAt: string;
};

export default function ApiKeysPage() {
  const { me } = useMe();
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [oneTimeKey, setOneTimeKey] = useState<string | null>(null);
  const [oneTimeOpen, setOneTimeOpen] = useState(false);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [revokeName, setRevokeName] = useState("");

  const refetch = useCallback(async () => {
    setListError(null);
    const res = await fetch("/api/api-keys");
    const data = (await res.json()) as { keys?: ApiKeyRow[]; error?: string };
    if (!res.ok) {
      setListError(formatApiError(data, data.error ?? `HTTP ${res.status}`));
      setKeys([]);
      return;
    }
    setKeys(Array.isArray(data.keys) ? data.keys : []);
  }, []);

  useEffect(() => {
    if (!me?.capabilities.canAccessSettings) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void refetch().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [me?.capabilities.canAccessSettings, refetch]);

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    setListError(null);
    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = (await res.json()) as {
        rawKey?: string;
        error?: string;
        name?: string;
        keyPrefix?: string;
      };
      if (!res.ok) {
        setListError(formatApiError(data, data.error ?? `HTTP ${res.status}`));
        return;
      }
      if (typeof data.rawKey === "string" && data.rawKey.length > 0) {
        setOneTimeKey(data.rawKey);
        setOneTimeOpen(true);
        setNewName("");
        await refetch();
      }
    } finally {
      setCreating(false);
    }
  }

  async function confirmRevoke() {
    if (!revokeId) return;
    const res = await fetch(`/api/api-keys/${encodeURIComponent(revokeId)}`, {
      method: "DELETE",
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setListError(formatApiError(data, data.error ?? `HTTP ${res.status}`));
    } else {
      setListError(null);
      await refetch();
    }
    setRevokeId(null);
    setRevokeName("");
  }

  if (!me) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>API keys</CardTitle>
          <CardDescription>Loading…</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!me.capabilities.canAccessSettings) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>API keys</CardTitle>
          <CardDescription>You do not have access to this page.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">API keys</h1>
        <p className="text-muted-foreground text-sm">
          Programmatic access with <code className="text-xs">sk_live_*</code> keys. Each secret is
          shown only once when created.
        </p>
      </div>

      {listError ? (
        <p className="text-destructive text-sm" role="alert">
          {listError}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Generate key</CardTitle>
          <CardDescription>Create a named key. You must copy the secret immediately — it cannot be
            retrieved later.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="grid w-full max-w-md gap-2">
            <Label htmlFor="api-key-name">Name</Label>
            <Input
              id="api-key-name"
              placeholder="e.g. CI / backup script"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              disabled={creating}
            />
          </div>
          <Button type="button" onClick={() => void handleCreate()} disabled={creating || !newName.trim()}>
            <PlusIcon className="mr-2 size-4" />
            Generate
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your keys</CardTitle>
          <CardDescription>Only the prefix is stored for display. Revoked keys are removed from this list.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-sm">Loading keys…</p>
          ) : keys.length === 0 ? (
            <p className="text-muted-foreground text-sm">No API keys yet. Generate your first key.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Prefix</TableHead>
                  <TableHead>Last used</TableHead>
                  <TableHead className="w-[100px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((k) => (
                  <TableRow key={k.id}>
                    <TableCell className="font-medium">{k.name}</TableCell>
                    <TableCell>
                      <code className="text-xs">{k.keyPrefix}</code>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {k.lastUsedAt
                        ? formatDistanceToNow(new Date(k.lastUsedAt), { addSuffix: true })
                        : "Never"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => {
                          setRevokeId(k.id);
                          setRevokeName(k.name);
                        }}
                        aria-label={`Revoke ${k.name}`}
                      >
                        <Trash2Icon className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={oneTimeOpen}
        onOpenChange={(open) => {
          if (!open) {
            setOneTimeOpen(false);
            setOneTimeKey(null);
          }
        }}
      >
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save your API key</DialogTitle>
            <DialogDescription className="text-destructive font-medium">
              Copy it now — you will not be able to see this secret again.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-muted/40 p-3">
            <code className="block break-all text-xs">{oneTimeKey}</code>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (oneTimeKey) void navigator.clipboard.writeText(oneTimeKey);
              }}
            >
              <CopyIcon className="mr-2 size-4" />
              Copy to clipboard
            </Button>
            <Button
              type="button"
              onClick={() => {
                setOneTimeOpen(false);
                setOneTimeKey(null);
                void refetch();
              }}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={revokeId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRevokeId(null);
            setRevokeName("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke API key?</AlertDialogTitle>
            <AlertDialogDescription>
              {revokeName ? (
                <>
                  This will immediately invalidate <strong>{revokeName}</strong>. Applications using this
                  key will lose access.
                </>
              ) : (
                "This will immediately invalidate the key."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void confirmRevoke()}
            >
              Revoke key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
