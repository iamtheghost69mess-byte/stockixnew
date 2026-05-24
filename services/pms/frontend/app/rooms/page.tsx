import { pmsFetch } from "@/lib/pms-client";

interface Room {
  id: string;
  name: string;
  type: string;
  capacity: number;
  rateCents: number;
  status: "available" | "occupied" | "maintenance" | "cleaning";
  description?: string;
  amenities: string; // JSON string
  floor?: number;
}

export default async function RoomsPage() {
  const res = await pmsFetch("/api/rooms");
  let rooms: Room[] = [];
  
  if (res.ok) {
    const data = await res.json();
    rooms = data.rooms || [];
  }

  // Fallback demo rooms
  const displayRooms = rooms.length > 0 ? rooms : [
    {
      id: "r-1",
      name: "Deluxe Suite 101",
      type: "deluxe",
      capacity: 3,
      rateCents: 18500,
      status: "available" as const,
      description: "Spacious master bedroom with city balcony.",
      amenities: '["wifi", "ac", "king_bed", "mini_bar"]',
      floor: 1
    },
    {
      id: "r-2",
      name: "Ocean View Villa 302",
      type: "villa",
      capacity: 6,
      rateCents: 45000,
      status: "occupied" as const,
      description: "Oceanfront luxury villa with personal deck and hot tub.",
      amenities: '["wifi", "ac", "pool", "kitchen", "deck"]',
      floor: 3
    },
    {
      id: "r-3",
      name: "Cozy Single 205",
      type: "standard",
      capacity: 1,
      rateCents: 8500,
      status: "cleaning" as const,
      description: "Compact single room ideal for solo travelers.",
      amenities: '["wifi", "ac", "single_bed"]',
      floor: 2
    },
    {
      id: "r-4",
      name: "Premium Suite 401",
      type: "suite",
      capacity: 4,
      rateCents: 29000,
      status: "maintenance" as const,
      description: "High floor premium suite currently under HVAC repair.",
      amenities: '["wifi", "ac", "bath_tub", "office_desk"]',
      floor: 4
    }
  ];

  const getStatusBadge = (status: Room["status"]) => {
    switch (status) {
      case "available":
        return <span className="badge badge-success">Available</span>;
      case "occupied":
        return <span className="badge badge-danger">Occupied</span>;
      case "cleaning":
        return <span className="badge badge-warning">Cleaning</span>;
      case "maintenance":
        return <span className="badge badge-info">Maintenance</span>;
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: "2rem", marginBottom: 6 }}>Rooms & Units</h1>
          <p style={{ color: "var(--text-secondary)" }}>Track real-time occupancy status, pricing, and housekeeping assignments across your estate.</p>
        </div>
        <button className="btn-primary">
          <span>+</span> Add Room
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 24 }}>
        {displayRooms.map((room) => {
          let parsedAmenities: string[] = [];
          try {
            parsedAmenities = JSON.parse(room.amenities);
          } catch {
            parsedAmenities = [];
          }

          return (
            <div key={room.id} className="glass-card" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <h2 style={{ fontSize: "1.2rem", fontWeight: 600 }}>{room.name}</h2>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                    Floor {room.floor || 0} • {room.type}
                  </span>
                </div>
                {getStatusBadge(room.status)}
              </div>

              <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", flexGrow: 1 }}>
                {room.description || "No description provided."}
              </p>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {parsedAmenities.map((amenity) => (
                  <span key={amenity} style={{ fontSize: "0.75rem", background: "rgba(255,255,255,0.04)", padding: "3px 8px", borderRadius: 4, color: "var(--text-secondary)", border: "1px solid var(--border-color)" }}>
                    {amenity.replace("_", " ")}
                  </span>
                ))}
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--border-color)", paddingTop: 16, marginTop: 8 }}>
                <div>
                  <span style={{ color: "var(--text-muted)", fontSize: "0.75rem", display: "block" }}>Rate per Night</span>
                  <span style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--accent-primary)" }}>
                    ${(room.rateCents / 100).toFixed(2)}
                  </span>
                </div>
                <button className="btn-secondary" style={{ padding: "6px 12px", fontSize: "0.85rem" }}>
                  Edit Room
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
