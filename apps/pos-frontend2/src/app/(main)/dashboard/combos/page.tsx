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
  type PosCombo,
  posCreateCombo,
  posDeleteCombo,
  posFetchCombos,
  posFetchMenuItems,
  posUpdateCombo,
} from "@/lib/pos-catalog-api";

type ComboDraft = {
  name: string;
  price: number;
  type: "fixed" | "choice";
  isActive: boolean;
  slots: { name: string; required: boolean; items: { menuItemId: string }[] }[];
};

const emptyDraft: ComboDraft = {
  name: "",
  price: 0,
  type: "choice",
  isActive: true,
  slots: [],
};

export default function CombosPage() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ComboDraft>(emptyDraft);
  const [slotName, setSlotName] = useState("");
  const [slotRequired, setSlotRequired] = useState(true);
  const [slotItemsCsv, setSlotItemsCsv] = useState("");

  const combosQuery = useQuery({
    queryKey: ["combos"],
    queryFn: posFetchCombos,
  });
  const menuItemsQuery = useQuery({
    queryKey: ["menu-items", "combo-picker"],
    queryFn: () => posFetchMenuItems({ available: true }),
  });

  const menuItemsById = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of menuItemsQuery.data || []) {
      map.set(String(item._id), item.name || "Item");
    }
    return map;
  }, [menuItemsQuery.data]);

  const createMutation = useMutation({
    mutationFn: (payload: Partial<PosCombo>) => posCreateCombo(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["combos"] });
      toast.success("Combo created.");
      setDraft(emptyDraft);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<PosCombo> }) => posUpdateCombo(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["combos"] });
      toast.success("Combo updated.");
      setDraft(emptyDraft);
      setEditingId(null);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => posDeleteCombo(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["combos"] });
      toast.success("Combo deleted.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const canSubmit = Boolean(draft.name.trim()) && Number(draft.price) >= 0 && draft.slots.length > 0;

  const addSlot = () => {
    const trimmedName = slotName.trim();
    if (!trimmedName) return;
    const ids = slotItemsCsv
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (ids.length === 0) return;
    setDraft((previous) => ({
      ...previous,
      slots: [...previous.slots, { name: trimmedName, required: slotRequired, items: ids.map((menuItemId) => ({ menuItemId })) }],
    }));
    setSlotName("");
    setSlotRequired(true);
    setSlotItemsCsv("");
  };

  const submit = () => {
    if (!canSubmit) return;
    const payload: Partial<PosCombo> = {
      name: draft.name,
      price: Number(draft.price || 0),
      type: draft.type,
      isActive: draft.isActive,
      slots: draft.slots,
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, payload });
      return;
    }
    createMutation.mutate(payload);
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="font-bold text-2xl">Combo Meals</h1>
        <p className="text-muted-foreground text-sm">Create fixed/choice combos and configure slots with allowed menu items.</p>
      </div>

      <div className="space-y-4 rounded-xl border p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={draft.name} onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Base price (USD)</Label>
            <Input
              type="number"
              step="0.01"
              value={draft.price}
              onChange={(event) => setDraft((prev) => ({ ...prev, price: Number(event.target.value || 0) }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={draft.type} onValueChange={(value: "fixed" | "choice") => setDraft((prev) => ({ ...prev, type: value }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed">Fixed</SelectItem>
                <SelectItem value="choice">Choice</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Label>Active</Label>
          <Switch checked={draft.isActive} onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, isActive: checked }))} />
        </div>

        <div className="space-y-3 rounded-lg border p-3">
          <div className="font-medium">Add slot</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Input value={slotName} onChange={(event) => setSlotName(event.target.value)} placeholder="Slot name (Main, Side...)" />
            <Input
              value={slotItemsCsv}
              onChange={(event) => setSlotItemsCsv(event.target.value)}
              placeholder="Menu item IDs comma-separated"
            />
            <Button type="button" onClick={addSlot}>
              Add slot
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <Label>Required</Label>
            <Switch checked={slotRequired} onCheckedChange={setSlotRequired} />
          </div>
          <p className="text-muted-foreground text-xs">
            Available menu item IDs: {(menuItemsQuery.data || []).map((item) => item._id).join(", ")}
          </p>
        </div>

        <div className="space-y-2">
          {draft.slots.map((slot, slotIndex) => (
            <div key={`${slot.name}-${slotIndex}`} className="rounded-md border px-3 py-2">
              <div className="font-medium">
                {slot.name} {slot.required ? "(required)" : "(optional)"}
              </div>
              <div className="text-muted-foreground text-xs">
                {slot.items.map((entry) => menuItemsById.get(String(entry.menuItemId)) || entry.menuItemId).join(", ")}
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <Button onClick={submit} disabled={!canSubmit || createMutation.isPending || updateMutation.isPending}>
            {editingId ? "Update combo" : "Create combo"}
          </Button>
          {editingId ? (
            <Button
              variant="outline"
              onClick={() => {
                setEditingId(null);
                setDraft(emptyDraft);
              }}
            >
              Cancel edit
            </Button>
          ) : null}
        </div>
      </div>

      <div className="rounded-xl border">
        <div className="border-b px-4 py-3 font-medium">Existing combos</div>
        <div className="divide-y">
          {(combosQuery.data || []).map((combo) => (
            <div key={combo._id} className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="font-medium">
                  {combo.name} - ${Number(combo.price || 0).toFixed(2)}
                </div>
                <div className="text-muted-foreground text-xs">
                  {combo.type} · {combo.isActive ? "active" : "inactive"} · {combo.slots.length} slots
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditingId(combo._id);
                    setDraft({
                      name: combo.name,
                      price: Number(combo.price || 0),
                      type: combo.type,
                      isActive: combo.isActive,
                      slots: combo.slots,
                    });
                  }}
                >
                  Edit
                </Button>
                <Button variant="destructive" size="sm" onClick={() => deleteMutation.mutate(combo._id)}>
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
