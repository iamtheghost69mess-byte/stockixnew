import { posApiJson } from "@/lib/pos-api-fetch";

export type PosCustomer = {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  vatNumber?: string;
  isBillingCustomer?: boolean;
  loyaltyPoints?: number;
  totalSpent?: number;
  lastVisit?: string;
};

export async function posListCustomers(): Promise<PosCustomer[]> {
  const res = await posApiJson<PosCustomer[]>("/api/customers");
  return Array.isArray(res.data) ? res.data : [];
}

export async function posCreateCustomer(data: Partial<PosCustomer>): Promise<PosCustomer> {
  const res = await posApiJson<PosCustomer>("/api/customers", {
    method: "POST",
    body: JSON.stringify(data),
  });
  if (!res.data) throw new Error(res.message || "Failed to create customer");
  return res.data;
}

export async function posUpdateCustomer(id: string, data: Partial<PosCustomer>): Promise<PosCustomer> {
  const res = await posApiJson<PosCustomer>(`/api/customers/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  if (!res.data) throw new Error(res.message || "Failed to update customer");
  return res.data;
}

export async function posDeleteCustomer(id: string): Promise<void> {
  await posApiJson(`/api/customers/${id}`, {
    method: "DELETE",
  });
}
