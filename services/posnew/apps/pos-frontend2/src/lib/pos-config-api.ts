import { posApiJson } from "@/lib/pos-api-fetch";

export type TaxConfig = {
  rate: number;
  ratePercent: number;
};

export async function posFetchTaxConfig() {
  return posApiJson<TaxConfig>("/api/config/tax");
}

export async function posUpdateTaxConfig(data: { ratePercent: number }) {
  return posApiJson<TaxConfig>("/api/config/tax", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export type LoyaltyConfig = {
  pointsPerRupee: number; // earn rate
  pointsPerRupeeOff: number; // redeem rate (e.g. 10 points = 1 currency)
  minRedeemPoints: number;
};

export async function posFetchLoyaltyConfig() {
  return posApiJson<LoyaltyConfig>("/api/loyalty/config");
}

export async function posUpdateLoyaltyConfig(data: Partial<LoyaltyConfig>) {
  return posApiJson<LoyaltyConfig>("/api/loyalty/config", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}
