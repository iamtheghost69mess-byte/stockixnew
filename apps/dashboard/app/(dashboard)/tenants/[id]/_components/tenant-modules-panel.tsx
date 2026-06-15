"use client";

import { useState } from "react";
import { Loader2, Minus, Plus } from "lucide-react";
import { toast } from "@/components/reusabletoast";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatApiError } from "@/lib/api-errors";
import { moduleLabel } from "@/lib/tenant-modules";
import type { TenantDetail } from "@/types/tenant";

import {
  asStockixModuleId,
  isAddableModule,
  moduleBadgeVariant,
  readJson,
  type AddableModule,
} from "./tenant-detail-utils";

export type TenantModulesPanelProps = {
  tenant: TenantDetail;
  tenantId: string;
  isSuper: boolean;
  onModulesChanged: () => Promise<void>;
};

export function TenantModulesPanel({
  tenant,
  tenantId,
  isSuper,
  onModulesChanged,
}: TenantModulesPanelProps) {
  const tenantModules = tenant.modules ?? [];
  const addableModules = (["pos", "pms", "chat"] as const).filter(
    (mod) => !tenantModules.includes(mod),
  );

  const [addModuleOpen, setAddModuleOpen] = useState(false);
  const [addModuleChoice, setAddModuleChoice] = useState<AddableModule>("pos");
  const [addingModule, setAddingModule] = useState(false);
  const [removeModuleOpen, setRemoveModuleOpen] = useState(false);
  const [moduleToRemove, setModuleToRemove] = useState<AddableModule | null>(null);
  const [removingModule, setRemovingModule] = useState(false);

  const addModule = async () => {
    setAddingModule(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/add-module`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module: addModuleChoice }),
      });
      const body = await readJson(res);
      if (!res.ok) {
        throw new Error(formatApiError(body, `HTTP ${res.status}`));
      }
      toast.success(`Module ${moduleLabel(addModuleChoice)} added — provisioning started`);
      setAddModuleOpen(false);
      await onModulesChanged();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setAddingModule(false);
    }
  };

  const removeModule = async () => {
    if (!moduleToRemove) return;
    setRemovingModule(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/remove-module`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module: moduleToRemove }),
      });
      const body = await readJson(res);
      if (!res.ok) {
        throw new Error(formatApiError(body, `HTTP ${res.status}`));
      }
      toast.success(`Module ${moduleLabel(moduleToRemove)} removed (data retained)`);
      setRemoveModuleOpen(false);
      setModuleToRemove(null);
      await onModulesChanged();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setRemovingModule(false);
    }
  };

  const openRemoveModule = (mod: AddableModule) => {
    setModuleToRemove(mod);
    setRemoveModuleOpen(true);
  };

  return (
    <>
      <div className="space-y-2 pt-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label>Licensed modules</Label>
          {isSuper && addableModules.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setAddModuleChoice(addableModules[0] ?? "pos");
                setAddModuleOpen(true);
              }}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add module
            </Button>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {tenant.modules.length > 0 ? (
            tenant.modules.map((mod) => (
              <div key={mod} className="flex items-center gap-1">
                <Badge variant={moduleBadgeVariant(mod)}>
                  {moduleLabel(asStockixModuleId(mod))}
                </Badge>
                {isSuper &&
                isAddableModule(mod) &&
                tenant.modules.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    title={`Remove ${moduleLabel(asStockixModuleId(mod))}`}
                    onClick={() => openRemoveModule(mod)}
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </div>
            ))
          ) : (
            <span className="text-sm text-muted-foreground">None configured</span>
          )}
        </div>
      </div>

      <Dialog
        open={addModuleOpen}
        onOpenChange={(open) => {
          setAddModuleOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add module</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Provisions the selected module stack for this tenant. Existing modules are unchanged.
          </p>
          <div className="space-y-2">
            <Label>Module</Label>
            <Select
              value={addModuleChoice}
              onValueChange={(v) => setAddModuleChoice(v as AddableModule)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select module" />
              </SelectTrigger>
              <SelectContent>
                {addableModules.map((mod) => (
                  <SelectItem key={mod} value={mod}>
                    {moduleLabel(mod)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddModuleOpen(false)}>
              Cancel
            </Button>
            <Button disabled={addingModule || addableModules.length === 0} onClick={() => void addModule()}>
              {addingModule ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Add & provision
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={removeModuleOpen}
        onOpenChange={(open) => {
          setRemoveModuleOpen(open);
          if (!open) setModuleToRemove(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove module</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Removes{" "}
            <span className="font-medium text-foreground">
              {moduleToRemove ? moduleLabel(moduleToRemove) : "this module"}
            </span>{" "}
            from the license and stops its Docker stack. Data volumes are not destroyed — stacks can be
            re-provisioned later by adding the module again.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRemoveModuleOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={removingModule || !moduleToRemove}
              onClick={() => void removeModule()}
            >
              {removingModule ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Remove module
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
