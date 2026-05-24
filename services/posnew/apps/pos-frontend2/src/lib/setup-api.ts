import { posApiJson } from "@/lib/pos-api-fetch";

export type SetupCurrentData = {
  displayName: string;
  tagline: string;
  receiptHeaderText: string;
  receiptFooterText: string;
  logoUrl: string;
  country: string;
  city: string;
  timezone: string;
  phone: string;
  address: string;
  taxVatNumber: string;
  mainLocationName: string;
  defaultCostMethod: string;
  stockDeductTrigger: string;
  strictOversellMode: string;
  zoneName: string;
};

export type SetupWizardStatus = {
  isBootstrapped: boolean;
  setupWizard: {
    isComplete: boolean;
    currentStep: number;
    completedSteps: number[];
    completedAt: string | null;
  };
  checklist: Record<string, boolean>;
  failedItems: string[];
  readyToGoLive: boolean;
  locations?: Array<{ _id: string; name?: string }>;
  locationCount?: number;
  zoneCount?: number;
  currentData?: SetupCurrentData;
};

export async function fetchSetupStatus() {
  return posApiJson<SetupWizardStatus>("/api/v1/setup/status");
}

export async function patchSetupStep(stepNumber: number, payload: Record<string, unknown>) {
  return posApiJson(`/api/v1/setup/step/${stepNumber}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function completeSetupWizard() {
  return posApiJson("/api/v1/setup/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
}
