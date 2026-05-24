"use client";

import { useState } from "react";
import { checkInBooking, checkOutBooking, cancelBooking } from "./actions";

export interface Booking {
  id: string;
  guestName: string;
  roomName: string;
  checkIn: string;
  checkOut: string;
  status: "confirmed" | "checked_in" | "checked_out" | "cancelled";
  platform: string;
  totalPriceCents: number;
  accountingSyncStatus: "pending" | "synced" | "failed";
}

interface BookingsViewProps {
  initialBookings: Booking[];
}

export function BookingsView({ initialBookings }: BookingsViewProps) {
  const [bookings, setBookings] = useState<Booking[]>(
    initialBookings.length > 0 ? initialBookings : [
      {
        id: "b-101",
        guestName: "Alice Smith",
        roomName: "Deluxe Suite 101",
        checkIn: "2026-05-24",
        checkOut: "2026-05-28",
        status: "confirmed",
        platform: "airbnb",
        totalPriceCents: 74000,
        accountingSyncStatus: "pending"
      },
      {
        id: "b-102",
        guestName: "Bob Johnson",
        roomName: "Ocean View Villa 302",
        checkIn: "2026-05-20",
        checkOut: "2026-05-25",
        status: "checked_in",
        platform: "booking.com",
        totalPriceCents: 225000,
        accountingSyncStatus: "pending"
      },
      {
        id: "b-103",
        guestName: "Carol White",
        roomName: "Cozy Single 205",
        checkIn: "2026-05-22",
        checkOut: "2026-05-24",
        status: "checked_out",
        platform: "direct",
        totalPriceCents: 17000,
        accountingSyncStatus: "synced"
      }
    ]
  );
  
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleAction = async (id: string, actionName: "check-in" | "check-out" | "cancel") => {
    setLoadingId(id);
    setErrorMsg(null);
    
    // If it's a real booking (UUID format), trigger the server action
    const isDemo = id.startsWith("b-");
    let res: { success: boolean; error?: any } = { success: true };
    
    if (!isDemo) {
      if (actionName === "check-in") {
        res = await checkInBooking(id);
      } else if (actionName === "check-out") {
        res = await checkOutBooking(id);
      } else {
        res = await cancelBooking(id);
      }
    }
    
    if (res.success) {
      // Optimistic update for demo or fallback
      setBookings((prev) =>
        prev.map((b) => {
          if (b.id === id) {
            let nextStatus = b.status;
            let nextSync = b.accountingSyncStatus;
            
            if (actionName === "check-in") nextStatus = "checked_in";
            else if (actionName === "check-out") {
              nextStatus = "checked_out";
              nextSync = "synced"; // Mock successful finance sync
            } else nextStatus = "cancelled";
            
            return { ...b, status: nextStatus, accountingSyncStatus: nextSync };
          }
          return b;
        })
      );
    } else {
      setErrorMsg(res.error);
    }
    setLoadingId(null);
  };

  const getStatusBadge = (status: Booking["status"]) => {
    switch (status) {
      case "confirmed":
        return <span className="badge badge-info">Confirmed</span>;
      case "checked_in":
        return <span className="badge badge-success">Checked In</span>;
      case "checked_out":
        return <span className="badge badge-warning">Checked Out</span>;
      case "cancelled":
        return <span className="badge badge-danger">Cancelled</span>;
    }
  };

  const getPlatformBadge = (platform: string) => {
    const formatted = platform.toUpperCase();
    const style = {
      padding: "2px 8px",
      borderRadius: 4,
      fontSize: "0.7rem",
      fontWeight: 600,
      background: "rgba(255, 255, 255, 0.05)",
      border: "1px solid var(--border-color)",
      color: "var(--text-secondary)"
    };
    if (platform === "airbnb") {
      style.color = "#ff5a5f";
      style.background = "rgba(255, 90, 95, 0.05)";
      style.border = "1px solid rgba(255, 90, 95, 0.2)";
    } else if (platform === "booking.com") {
      style.color = "#003580";
      style.background = "rgba(0, 53, 128, 0.1)";
      style.border = "1px solid rgba(0, 53, 128, 0.2)";
    } else if (platform === "direct") {
      style.color = "var(--accent-primary)";
      style.background = "rgba(0, 229, 255, 0.05)";
      style.border = "1px solid rgba(0, 229, 255, 0.2)";
    }
    return <span style={style}>{formatted}</span>;
  };

  const getSyncBadge = (status: Booking["accountingSyncStatus"]) => {
    switch (status) {
      case "synced":
        return <span className="badge badge-success" style={{ fontSize: "0.65rem", padding: "2px 6px" }}>Synced (Finance)</span>;
      case "failed":
        return <span className="badge badge-danger" style={{ fontSize: "0.65rem", padding: "2px 6px" }}>Sync Failed</span>;
      default:
        return <span className="badge badge-warning" style={{ fontSize: "0.65rem", padding: "2px 6px" }}>Pending Sync</span>;
    }
  };

  // Calculate metrics
  const activeCount = bookings.filter((b) => b.status === "checked_in").length;
  const pendingCount = bookings.filter((b) => b.status === "confirmed").length;
  const completedCount = bookings.filter((b) => b.status === "checked_out").length;
  const totalRevenue = bookings
    .filter((b) => b.status === "checked_out")
    .reduce((acc, curr) => acc + curr.totalPriceCents, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: "2rem", marginBottom: 6 }}>Bookings</h1>
          <p style={{ color: "var(--text-secondary)" }}>Verify guest arrivals, handle live check-ins/outs, and check automated Finance sync statuses.</p>
        </div>
        <button className="btn-primary">
          <span>+</span> Create Booking
        </button>
      </div>

      {errorMsg && (
        <div style={{ background: "var(--color-danger-bg)", color: "var(--color-danger)", border: "1px solid var(--color-danger)", padding: "12px 16px", borderRadius: 8, fontSize: "0.9rem" }}>
          ⚠️ <strong>Error:</strong> {errorMsg}
        </div>
      )}

      {/* Stats Cards */}
      <div className="stats-grid">
        <div className="glass-card">
          <span style={{ color: "var(--text-secondary)", fontSize: "0.85rem", textTransform: "uppercase" }}>Checked In Guests</span>
          <div className="stat-val">{activeCount}</div>
        </div>
        <div className="glass-card">
          <span style={{ color: "var(--text-secondary)", fontSize: "0.85rem", textTransform: "uppercase" }}>Pending Arrivals</span>
          <div className="stat-val">{pendingCount}</div>
        </div>
        <div className="glass-card">
          <span style={{ color: "var(--text-secondary)", fontSize: "0.85rem", textTransform: "uppercase" }}>Completed Stays</span>
          <div className="stat-val">{completedCount}</div>
        </div>
        <div className="glass-card" style={{ borderLeft: "3px solid var(--accent-primary)" }}>
          <span style={{ color: "var(--text-secondary)", fontSize: "0.85rem", textTransform: "uppercase" }}>Synced Revenue</span>
          <div className="stat-val" style={{ color: "var(--accent-primary)" }}>
            ${(totalRevenue / 100).toFixed(2)}
          </div>
        </div>
      </div>

      {/* Bookings Table */}
      <div className="glass-card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="table-container">
          <table className="premium-table">
            <thead>
              <tr>
                <th>Guest</th>
                <th>Room</th>
                <th>Dates</th>
                <th>Source</th>
                <th>Price</th>
                <th>Status</th>
                <th>Accounting</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{b.guestName}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 2 }}>ID: {b.id}</div>
                  </td>
                  <td>{b.roomName}</td>
                  <td>
                    <div style={{ fontSize: "0.85rem" }}>
                      📅 {b.checkIn} → {b.checkOut}
                    </div>
                  </td>
                  <td>{getPlatformBadge(b.platform)}</td>
                  <td style={{ fontWeight: 600 }}>
                    ${(b.totalPriceCents / 100).toFixed(2)}
                  </td>
                  <td>{getStatusBadge(b.status)}</td>
                  <td>{getSyncBadge(b.accountingSyncStatus)}</td>
                  <td style={{ textAlign: "right" }}>
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      {b.status === "confirmed" && (
                        <button
                          className="btn-primary"
                          style={{ padding: "6px 12px", fontSize: "0.8rem", background: "linear-gradient(135deg, var(--color-success) 0%, #00c853 100%)", boxShadow: "none" }}
                          disabled={loadingId === b.id}
                          onClick={() => handleAction(b.id, "check-in")}
                        >
                          Check In
                        </button>
                      )}
                      {b.status === "checked_in" && (
                        <button
                          className="btn-primary"
                          style={{ padding: "6px 12px", fontSize: "0.8rem", background: "linear-gradient(135deg, var(--color-warning) 0%, #ffd600 100%)", color: "#000", boxShadow: "none" }}
                          disabled={loadingId === b.id}
                          onClick={() => handleAction(b.id, "check-out")}
                        >
                          Check Out
                        </button>
                      )}
                      {b.status !== "checked_out" && b.status !== "cancelled" && (
                        <button
                          className="btn-secondary"
                          style={{ padding: "6px 12px", fontSize: "0.8rem" }}
                          disabled={loadingId === b.id}
                          onClick={() => handleAction(b.id, "cancel")}
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
