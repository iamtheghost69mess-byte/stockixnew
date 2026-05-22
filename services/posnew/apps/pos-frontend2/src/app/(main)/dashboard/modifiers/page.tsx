"use client";

import { useMemo, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  type PosModifierGroup,
  posCreateModifierGroup,
  posDeleteModifierGroup,
  posFetchModifierGroups,
  posUpdateModifierGroup,
} from "@/lib/pos-catalog-api";

const emptyModifier: Partial<PosModifierGroup> = {
  name: "",
  type: "addon",
  required: false,
  minSelections: 1,
  maxSelections: 1,
  options: [],
  isActive: true,
};

export default function ModifiersPage() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Partial<PosModifierGroup>>(emptyModifier);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [optionInput, setOptionInput] = useState("");

  const groupsQuery = useQuery({
    queryKey: ["modifier-groups"],
    queryFn: posFetchModifierGroups,
  });

  const createMutation = useMutation({
    mutationFn: posCreateModifierGroup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["modifier-groups"] });
      toast.success("Modifier group created.");
      setDraft(emptyModifier);
      setOptionInput("");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<PosModifierGroup> }) =>
      posUpdateModifierGroup(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["modifier-groups"] });
      toast.success("Modifier group updated.");
      setDraft(emptyModifier);
      setEditingId(null);
      setOptionInput("");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: posDeleteModifierGroup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["modifier-groups"] });
      toast.success("Modifier group deleted.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const canSubmit = useMemo(() => {
    return Boolean(draft.name?.trim() && draft.type);
  }, [draft.name, draft.type]);

  const submit = () => {
    if (!canSubmit) return;
    if (editingId) {
      updateMutation.mutate({ id: editingId, payload: draft });
      return;
    }
    createMutation.mutate(draft);
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Modifier Groups</h1>
        <p className="text-sm text-muted-foreground">
          Create and manage variant/add-on groups for menu items.
        </p>
      </div>

      <div className="rounded-xl border p-4 space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              value={draft.name || ""}
              onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Size"
            />
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select
              value={draft.type || "addon"}
              onValueChange={(value) => setDraft((prev) => ({ ...prev, type: value as "addon" | "variant" }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="addon">Addon</SelectItem>
                <SelectItem value="variant">Variant</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Min selections</Label>
            <Input
              type="number"
              value={draft.minSelections ?? 1}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, minSelections: Number(event.target.value || 0) }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Max selections</Label>
            <Input
              type="number"
              value={draft.maxSelections ?? 1}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, maxSelections: Number(event.target.value || 1) }))
              }
            />
          </div>
          <div className="flex items-center gap-4 pt-8">
            <Label>Required</Label>
            <Switch
              checked={Boolean(draft.required)}
              onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, required: checked }))}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Options</Label>
          <div className="flex gap-2">
            <Input
              value={optionInput}
              onChange={(event) => setOptionInput(event.target.value)}
              placeholder="Large:+2.5"
            />
            <Button
              type="button"
              onClick={() => {
                const raw = optionInput.trim();
                if (!raw) return;
                const [namePart, amountPart] = raw.split(":");
                const name = namePart?.trim();
                if (!name) return;
                const priceAdjustment = Number(amountPart || 0);
                setDraft((prev) => ({
                  ...prev,
                  options: [...(prev.options || []), { name, priceAdjustment }],
                }));
                setOptionInput("");
              }}
            >
              Add option
            </Button>
          </div>
          <div className="space-y-1">
            {(draft.options || []).map((option, index) => (
              <div key={`${option.name}-${index}`} className="flex items-center justify-between rounded border px-3 py-2">
                <span>{option.name}</span>
                <span className="text-xs text-muted-foreground">{option.priceAdjustment}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={submit} disabled={!canSubmit || createMutation.isPending || updateMutation.isPending}>
            {editingId ? "Update modifier group" : "Create modifier group"}
          </Button>
          {editingId ? (
            <Button
              variant="outline"
              onClick={() => {
                setEditingId(null);
                setDraft(emptyModifier);
                setOptionInput("");
              }}
            >
              Cancel edit
            </Button>
          ) : null}
        </div>
      </div>

      <div className="rounded-xl border">
        <div className="border-b px-4 py-3 font-medium">Existing groups</div>
        <div className="divide-y">
          {(groupsQuery.data || []).map((group) => (
            <div key={group._id} className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="font-medium">{group.name}</div>
                <div className="text-xs text-muted-foreground">
                  {group.type} · {group.required ? "required" : "optional"} · {group.options.length} options
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditingId(group._id);
                    setDraft(group);
                    setOptionInput("");
                  }}
                >
                  Edit
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => deleteMutation.mutate(group._id)}
                  disabled={deleteMutation.isPending}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

