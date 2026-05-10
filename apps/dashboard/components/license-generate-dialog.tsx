"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type PlanOpt = { slug: string; name: string };
type TenantOpt = { id: string; name: string; slug: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTenantId?: string;
  onSuccess: () => void;
};

export default function LicenseGenerateDialog({
  open,
  onOpenChange,
  defaultTenantId,
  onSuccess,
}: Props) {
  const [plans, setPlans] = useState<PlanOpt[]>([]);
  const [tenants, setTenants] = useState<TenantOpt[]>([]);
  const [product, setProduct] = useState<"platform" | "pos_desktop" | "bundle">("platform");
  const [planSlug, setPlanSlug] = useState("starter");
  const [count, setCount] = useState(1);
  const [term, setTerm] = useState<"perpetual" | "fixed">("perpetual");
  const [expiresAt, setExpiresAt] = useState<Date | undefined>(undefined);
  const [maxActivations, setMaxActivations] = useState(1);
  const [graceDays, setGraceDays] = useState(7);
  const [tenantId, setTenantId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedKeys, setGeneratedKeys] = useState<string[]>([]);

  useEffect(() => {
    if (!open) {
      setGeneratedKeys([]);
      setError(null);
      return;
    }
    void (async () => {
      const [pRes, tRes] = await Promise.all([fetch("/api/plans"), fetch("/api/tenants")]);
      const pJson = (await pRes.json().catch(() => ({}))) as { plans?: { slug: string; name: string }[] };
      const tJson = (await tRes.json().catch(() => ({}))) as {
        tenants?: { tenantId: string; name: string; slug: string }[];
      };
      if (pRes.ok && pJson.plans?.length) {
        const list = pJson.plans.map((p) => ({ slug: p.slug, name: p.name }));
        setPlans(list);
        setPlanSlug((prev) => (list.some((p) => p.slug === prev) ? prev : list[0]!.slug));
      }
      if (tRes.ok && tJson.tenants?.length) {
        setTenants(
          tJson.tenants.map((t) => ({ id: t.tenantId, name: t.name, slug: t.slug })),
        );
      }
    })();
  }, [open]);

  useEffect(() => {
    if (open && defaultTenantId) {
      setTenantId(defaultTenantId);
    }
    if (open && !defaultTenantId) {
      setTenantId("");
    }
  }, [open, defaultTenantId]);

  const submit = async () => {
    setLoading(true);
    setError(null);
    setGeneratedKeys([]);
    try {
      const isPerpetual = term === "perpetual";
      const body = {
        product,
        planSlug,
        count,
        isPerpetual,
        expiresAt:
          !isPerpetual && expiresAt ? expiresAt.toISOString() : undefined,
        maxActivations: product === "platform" ? 1 : maxActivations,
        gracePeriodDays: graceDays,
        notes: notes.trim() || undefined,
        tenantId: tenantId || undefined,
      };
      const res = await fetch("/api/licenses/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        licenses?: { licenseKey: string }[];
        detail?: unknown;
      };
      if (!res.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : `Failed (${res.status})`,
        );
        return;
      }
      const keys = (data.licenses ?? []).map((l) => l.licenseKey);
      setGeneratedKeys(keys);
      if (keys.length === 1) {
        toast.success(`License generated: ${keys[0]}`);
      } else {
        toast.success(`${keys.length} licenses generated`);
      }
      window.setTimeout(() => {
        onSuccess();
        onOpenChange(false);
        setGeneratedKeys([]);
        setNotes("");
        setCount(1);
      }, 1500);
    } finally {
      setLoading(false);
    }
  };

  const copyAll = async () => {
    await navigator.clipboard.writeText(generatedKeys.join("\n"));
    toast.success("Copied all keys");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90vh,800px)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Generate licenses</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Product</Label>
            <Select
              value={product}
              onValueChange={(v) => setProduct(v as typeof product)}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="platform">Platform</SelectItem>
                <SelectItem value="pos_desktop">POS Desktop</SelectItem>
                <SelectItem value="bundle">Bundle</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Plan</Label>
            <Select
              value={planSlug}
              onValueChange={(v) => setPlanSlug(v ?? "starter")}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {plans.map((p) => (
                  <SelectItem key={p.slug} value={p.slug}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Count</Label>
            <Input
              className="mt-1"
              type="number"
              min={1}
              max={100}
              value={count}
              onChange={(e) => setCount(Number(e.target.value) || 1)}
            />
          </div>
          <div className="space-y-2">
            <Label>License type</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className={cn(
                  "rounded-lg border p-3 text-left text-sm transition-all",
                  term === "perpetual" ? "ring-2 ring-primary" : "hover:bg-muted/50",
                )}
                onClick={() => setTerm("perpetual")}
              >
                <p className="font-medium">Perpetual</p>
                <p className="text-xs text-muted-foreground">No expiry date</p>
              </button>
              <button
                type="button"
                className={cn(
                  "rounded-lg border p-3 text-left text-sm transition-all",
                  term === "fixed" ? "ring-2 ring-primary" : "hover:bg-muted/50",
                )}
                onClick={() => setTerm("fixed")}
              >
                <p className="font-medium">Fixed term</p>
                <p className="text-xs text-muted-foreground">Set an expiry date</p>
              </button>
            </div>
            {term === "fixed" ? (
              <Popover>
                <PopoverTrigger>
                  <Button variant="outline" className="w-full justify-start font-normal">
                    {expiresAt ? format(expiresAt, "PPP") : "Pick expiry date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={expiresAt}
                    onSelect={setExpiresAt}
                  />
                </PopoverContent>
              </Popover>
            ) : null}
          </div>
          {product !== "platform" ? (
            <div className="transition-all">
              <Label>Max activations</Label>
              <Input
                className="mt-1"
                type="number"
                min={1}
                max={50}
                value={maxActivations}
                onChange={(e) => setMaxActivations(Number(e.target.value) || 1)}
              />
            </div>
          ) : null}
          <div>
            <Label>Offline grace period (days)</Label>
            <Input
              className="mt-1"
              type="number"
              min={0}
              max={365}
              value={graceDays}
              onChange={(e) => setGraceDays(Number(e.target.value) || 0)}
            />
          </div>
          <div>
            <Label>Assign to tenant (optional)</Label>
            <Select
              value={tenantId || "__none__"}
              onValueChange={(v) =>
                setTenantId(v === "__none__" || v == null ? "" : v)
              }
              disabled={Boolean(defaultTenantId)}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {tenants.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} ({t.slug})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Notes (optional)</Label>
            <Textarea
              className="mt-1"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {generatedKeys.length > 0 ? (
            <div className="rounded-md border p-3 text-sm">
              <p className="font-medium">{generatedKeys.length === 1 ? "Generated key" : "Generated keys"}</p>
              <ul className="mt-2 max-h-32 overflow-y-auto font-mono text-xs">
                {generatedKeys.map((k) => (
                  <li key={k}>{k}</li>
                ))}
              </ul>
              {generatedKeys.length > 1 ? (
                <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => void copyAll()}>
                  Copy all
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={
              loading
              || (term === "fixed" && !expiresAt)
              || (product !== "platform" && maxActivations < 1)
            }
            onClick={() => void submit()}
          >
            {loading ? "Generating…" : "Generate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
