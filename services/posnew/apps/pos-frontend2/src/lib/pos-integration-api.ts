import { posApiJson } from "@/lib/pos-api-fetch";

/** Replay Finance sync for a paid order (Bigcapital bridge). */
export async function posReplayFinanceSync(orderId: string): Promise<void> {
  await posApiJson<{ queued?: boolean }>(`/api/integration/sync/replay/${orderId}`, {
    method: "POST",
  });
}
