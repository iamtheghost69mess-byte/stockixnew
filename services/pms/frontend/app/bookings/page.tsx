import { pmsFetch } from "@/lib/pms-client";
import { BookingsView, type Booking } from "./bookings-view";

interface ApiBooking {
  id: string;
  tenantId: string;
  propertyId: string;
  roomId: string;
  guestId: string;
  checkIn: string;
  checkOut: string;
  bookingStatus: "confirmed" | "checked_in" | "checked_out" | "cancelled" | "no_show";
  paymentStatus: string;
  totalAmountCents: number;
  adults: number;
  children: number;
  platform: string;
  specialRequests?: string;
  notes?: string;
  checkInActualAt?: string;
  checkOutActualAt?: string;
  accountingSyncStatus: "pending" | "synced" | "failed";
  financeReceiptId?: number;
  createdAt: string;
  updatedAt: string;
}

export default async function BookingsPage() {
  const res = await pmsFetch("/api/bookings");
  let rawBookings: ApiBooking[] = [];
  
  if (res.ok) {
    try {
      const data = await res.json();
      rawBookings = data.bookings || [];
    } catch {
      rawBookings = [];
    }
  }

  // Map API bookings to UI bookings structure
  const bookings: Booking[] = rawBookings.map((b) => {
    // Map bookingStatus to UI status expectations
    let status: Booking["status"] = "confirmed";
    if (b.bookingStatus === "checked_in") status = "checked_in";
    else if (b.bookingStatus === "checked_out") status = "checked_out";
    else if (b.bookingStatus === "cancelled" || b.bookingStatus === "no_show") status = "cancelled";

    return {
      id: b.id,
      guestName: `Guest #${b.guestId.substring(0, 5)}`, // Fallback display name since guest relation is internal
      roomName: `Room #${b.roomId.substring(0, 5)}`,   // Fallback display name since room relation is internal
      checkIn: b.checkIn,
      checkOut: b.checkOut,
      status,
      platform: b.platform,
      totalPriceCents: b.totalAmountCents,
      accountingSyncStatus: b.accountingSyncStatus,
    };
  });

  return (
    <section>
      <BookingsView initialBookings={bookings} />
    </section>
  );
}
