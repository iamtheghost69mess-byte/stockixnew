"use strict";

"use server";

import { revalidatePath } from "next/cache";
import { pmsFetch } from "@/lib/pms-client";

export async function checkInBooking(id: string) {
  try {
    const res = await pmsFetch(`/api/bookings/${id}/check-in`, {
      method: "POST",
    });
    if (!res.ok) {
      const errorMsg = await res.text();
      return { success: false, error: errorMsg || "Failed to check in" };
    }
    revalidatePath("/bookings");
    revalidatePath("/rooms");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function checkOutBooking(id: string) {
  try {
    const res = await pmsFetch(`/api/bookings/${id}/check-out`, {
      method: "POST",
    });
    if (!res.ok) {
      const errorMsg = await res.text();
      return { success: false, error: errorMsg || "Failed to check out" };
    }
    revalidatePath("/bookings");
    revalidatePath("/rooms");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function cancelBooking(id: string) {
  try {
    const res = await pmsFetch(`/api/bookings/${id}/cancel`, {
      method: "POST",
    });
    if (!res.ok) {
      const errorMsg = await res.text();
      return { success: false, error: errorMsg || "Failed to cancel" };
    }
    revalidatePath("/bookings");
    revalidatePath("/rooms");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
