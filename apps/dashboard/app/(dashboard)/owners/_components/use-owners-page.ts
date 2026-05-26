"use client";

import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { useMe } from "@/hooks/use-me";
import { formatApiError } from "@/lib/api-errors";
import { ROLE, type Role } from "@/lib/roles";
import { inviteOwnerSchema, type InviteOwnerValues } from "@/lib/schemas";
import { toast } from "@/components/reusabletoast";

export type Owner = {
  id: string;
  email: string;
  name: string;
  role: Role;
  roleName?: string | null;
  hasPassword?: boolean;
  mfaEnabled: boolean;
  createdAt: string;
  inviteTokenExpiresAt?: string | null;
};

export function useOwnersPage() {
  const me = useMe();
  const canManageOwners = Boolean(me?.capabilities.canManageOwners);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [loadErr, setLoadErr] = useState("");
  const [loading, setLoading] = useState(true);

  const [adding, setAdding] = useState(false);
  const [addErr, setAddErr] = useState("");

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteErr, setDeleteErr] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  const inviteForm = useForm<InviteOwnerValues>({
    resolver: zodResolver(inviteOwnerSchema),
    defaultValues: { email: "", name: "", roleId: undefined, role: ROLE.READ_ONLY },
  });

  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [roleChangeTarget, setRoleChangeTarget] = useState<{
    owner: Owner;
    nextRole: Role;
  } | null>(null);
  const [roleSaving, setRoleSaving] = useState(false);
  const [roleErr, setRoleErr] = useState("");
  const [roleSuccess, setRoleSuccess] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<Owner | null>(null);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState("");
  const [resendingId, setResendingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadErr("");
    try {
      const res = await fetch("/api/owners");
      const dataUnknown = await res.json().catch(() => ({}));
      const data = dataUnknown as {
        owners?: Array<
          Partial<Owner> & {
            id: string;
            email: string;
            name: string;
            role: Role;
            createdAt: string;
          }
        >;
        error?: string;
      };
      if (!res.ok) throw new Error(formatApiError(dataUnknown, data.error ?? `HTTP ${res.status}`));
      const parsed: Owner[] = (data.owners ?? []).map((o) => ({
        id: o.id,
        email: o.email,
        name: o.name,
        role: o.role,
        roleName: o.roleName ?? null,
        hasPassword: o.hasPassword,
        mfaEnabled: o.mfaEnabled ?? false,
        createdAt: o.createdAt,
        inviteTokenExpiresAt: o.inviteTokenExpiresAt ?? null,
      }));
      setOwners(parsed);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onInviteSubmit = inviteForm.handleSubmit(async (values) => {
    setAddErr("");
    setAdding(true);
    try {
      const res = await fetch("/api/owners/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: values.email,
          name: values.name,
          ...(values.roleId ? { roleId: values.roleId } : { role: values.role ?? ROLE.READ_ONLY }),
        }),
      });
      const data = (await res.json()) as {
        owner?: Owner;
        inviteUrl?: string;
        emailSent?: boolean;
        emailQueued?: boolean;
        mailConfigured?: boolean;
        error?: string;
      };
      if (!res.ok) {
        setAddErr(formatApiError(data, data.error ?? `HTTP ${res.status}`));
        return;
      }
      if (data.mailConfigured === false) {
        setInviteUrl(data.inviteUrl ?? "");
        toast.warning(
          "Email is not configured on this server. Copy the invite link below to share manually.",
        );
      } else if (data.emailQueued === true) {
        setInviteUrl("");
        toast.success("Invitation queued; email will be sent shortly.");
      } else if (data.emailSent === false) {
        setInviteUrl(data.inviteUrl ?? "");
        toast.warning(
          "Invitation created but email was not sent. Copy the invite link below.",
        );
      } else {
        setInviteUrl("");
        toast.success("Invitation email sent");
      }
      setCopiedInvite(false);
      setInviteOpen(false);
      inviteForm.reset();
      await load();
    } catch (e) {
      setAddErr(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(false);
    }
  });

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

  async function copyOwnerId(id: string) {
    try {
      await navigator.clipboard.writeText(id);
      toast.success("Copied owner ID");
    } catch {
      toast.error("Could not copy");
    }
  }

  async function applyRoleChange() {
    if (!roleChangeTarget) return;
    setRoleSaving(true);
    setRoleErr("");
    setRoleSuccess("");
    try {
      const res = await fetch(`/api/owners/${roleChangeTarget.owner.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: roleChangeTarget.nextRole }),
      });
      const data = (await res.json()) as {
        error?: string;
        message?: string;
        owner?: Owner;
      };
      if (!res.ok) {
        setRoleErr(formatApiError(data, data.message ?? data.error ?? `HTTP ${res.status}`));
        return;
      }
      if (data.owner) {
        setOwners((prev) =>
          prev.map((o) =>
            o.id === data.owner!.id ? { ...o, role: data.owner!.role } : o,
          ),
        );
      } else {
        await load();
      }
      setRoleSuccess("Role updated successfully.");
      setRoleDialogOpen(false);
      setRoleChangeTarget(null);
    } catch (e) {
      setRoleErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRoleSaving(false);
    }
  }

  async function executeDelete() {
    if (!deleteTarget) return;
    if (deleteConfirmEmail.trim().toLowerCase() !== deleteTarget.email.toLowerCase()) {
      return;
    }
    setDeleteErr("");
    setDeletingId(deleteTarget.id);
    try {
      const res = await fetch(`/api/owners/${deleteTarget.id}`, {
        method: "DELETE",
      });
      const dataUnknown = await res.json().catch(() => ({}));
      const data = dataUnknown as { error?: string; detail?: string };
      if (!res.ok) {
        setDeleteErr(
          formatApiError(dataUnknown, data.detail ?? data.error ?? `HTTP ${res.status}`),
        );
        return;
      }
      setDeleteTarget(null);
      setDeleteConfirmEmail("");
      await load();
    } catch (e) {
      setDeleteErr(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingId(null);
    }
  }

  function openInviteDialog() {
    setInviteOpen(true);
  }

  function closeInviteDialog() {
    setInviteOpen(false);
    inviteForm.reset();
    setAddErr("");
  }

  function handleInviteOpenChange(open: boolean) {
    setInviteOpen(open);
    if (!open) {
      inviteForm.reset();
      setAddErr("");
    }
  }

  function openRoleDialog(owner: Owner, nextRole: Role) {
    setRoleChangeTarget({ owner, nextRole });
    setRoleDialogOpen(true);
  }

  function cancelRoleDialog() {
    setRoleDialogOpen(false);
    setRoleChangeTarget(null);
  }

  function openDeleteDialog(owner: Owner) {
    setDeleteTarget(owner);
    setDeleteConfirmEmail("");
    setDeleteErr("");
  }

  function handleDeleteOpenChange(open: boolean) {
    if (!open) {
      setDeleteTarget(null);
      setDeleteConfirmEmail("");
    }
  }

  function cancelDeleteDialog() {
    setDeleteTarget(null);
    setDeleteConfirmEmail("");
  }

  async function resendInvitation(owner: Owner) {
    setResendingId(owner.id);
    try {
      const res = await fetch(`/api/owners/${owner.id}/resend-invite`, {
        method: "POST",
      });
      const data = (await res.json()) as {
        emailSent?: boolean;
        emailQueued?: boolean;
        mailConfigured?: boolean;
        inviteUrl?: string;
        error?: string;
      };
      if (!res.ok) {
        toast.error(formatApiError(data, data.error ?? `HTTP ${res.status}`));
        return;
      }
      if (data.mailConfigured === false && data.inviteUrl) {
        setInviteUrl(data.inviteUrl);
        toast.warning(
          "Email is not configured. Copy the invite link from the banner above.",
        );
      } else if (data.emailQueued === true) {
        toast.success("Invitation queued; email will be sent shortly.");
      } else if (data.emailSent === false && data.inviteUrl) {
        setInviteUrl(data.inviteUrl);
        toast.warning("Email not sent. Copy the invite link from the banner above.");
      } else {
        toast.success("Invitation resent");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setResendingId(null);
    }
  }

  return {
    me,
    canManageOwners,
    owners,
    loadErr,
    loading,
    adding,
    addErr,
    setAddErr,
    deletingId,
    deleteErr,
    inviteUrl,
    copiedInvite,
    inviteOpen,
    inviteForm,
    onInviteSubmit,
    copyInviteUrl,
    openInviteDialog,
    closeInviteDialog,
    handleInviteOpenChange,
    roleDialogOpen,
    setRoleDialogOpen,
    roleChangeTarget,
    roleSaving,
    roleErr,
    roleSuccess,
    applyRoleChange,
    openRoleDialog,
    cancelRoleDialog,
    deleteTarget,
    deleteConfirmEmail,
    setDeleteConfirmEmail,
    executeDelete,
    openDeleteDialog,
    handleDeleteOpenChange,
    cancelDeleteDialog,
    copyOwnerId,
    resendingId,
    resendInvitation,
  };
}
