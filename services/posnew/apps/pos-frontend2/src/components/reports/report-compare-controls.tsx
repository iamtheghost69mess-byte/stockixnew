"use client";

import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

type ReportCompareControlsProps = {
  readonly enabled: boolean;
  readonly onEnabledChange: (value: boolean) => void;
  readonly currentFrom: string;
  readonly currentTo: string;
  readonly compareFrom: string;
  readonly compareTo: string;
  readonly onCurrentFromChange: (value: string) => void;
  readonly onCurrentToChange: (value: string) => void;
  readonly onCompareFromChange: (value: string) => void;
  readonly onCompareToChange: (value: string) => void;
};

export function ReportCompareControls(props: ReportCompareControlsProps) {
  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-sm">Compare</p>
          <p className="text-muted-foreground text-xs">Enable side-by-side date range comparison.</p>
        </div>
        <Switch checked={props.enabled} onCheckedChange={props.onEnabledChange} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="grid gap-2 md:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Current from</Label>
            <Input type="date" value={props.currentFrom} onChange={(event) => props.onCurrentFromChange(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Current to</Label>
            <Input type="date" value={props.currentTo} onChange={(event) => props.onCurrentToChange(event.target.value)} />
          </div>
        </div>
        {props.enabled ? (
          <div className="grid gap-2 md:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Compare from</Label>
              <Input type="date" value={props.compareFrom} onChange={(event) => props.onCompareFromChange(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Compare to</Label>
              <Input type="date" value={props.compareTo} onChange={(event) => props.onCompareToChange(event.target.value)} />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
