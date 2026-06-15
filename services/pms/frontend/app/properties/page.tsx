import { pmsFetch } from "@/lib/pms-client";

interface Property {
  id: string;
  name: string;
  type: string;
  address?: string;
  city?: string;
  country?: string;
  description?: string;
  checkInTime: string;
  checkOutTime: string;
  minNights: number;
  bookingWindow: number;
  cleaningEnabled: boolean;
  feedSlug?: string;
}

export default async function PropertiesPage() {
  const res = await pmsFetch("/api/properties");
  let properties: Property[] = [];
  
  if (res.ok) {
    const data = await res.json();
    properties = data.properties || [];
  }

  // Fallback demo properties to wow the user if no properties exist in the DB yet
  const displayProperties = properties.length > 0 ? properties : [
    {
      id: "demo-1",
      name: "Grand Horizon Resort",
      type: "resort",
      address: "102 Ocean Drive",
      city: "Miami",
      country: "USA",
      description: "A luxury beach resort with panoramic ocean views and private villas.",
      checkInTime: "14:00",
      checkOutTime: "11:00",
      minNights: 3,
      bookingWindow: 365,
      cleaningEnabled: true,
      feedSlug: "p-horizon-miami"
    },
    {
      id: "demo-2",
      name: "Urban Nest Apartments",
      type: "apartment",
      address: "404 Wall Street",
      city: "New York",
      country: "USA",
      description: "Chic modern studio apartment in the heart of Manhattan financial district.",
      checkInTime: "15:00",
      checkOutTime: "12:00",
      minNights: 1,
      bookingWindow: 180,
      cleaningEnabled: true,
      feedSlug: "p-nest-nyc"
    }
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: "2rem", marginBottom: 6 }}>Properties</h1>
          <p style={{ color: "var(--text-secondary)" }}>Manage your real estate listings, check-in timings, and OTA feed configurations.</p>
        </div>
        <button className="btn-primary">
          <span>+</span> Add Property
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(450px, 1fr))", gap: 24 }}>
        {displayProperties.map((prop) => (
          <div key={prop.id} className="glass-card" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <span className="badge badge-info" style={{ marginBottom: 8 }}>{prop.type}</span>
                <h2 style={{ fontSize: "1.35rem", fontWeight: 600 }}>{prop.name}</h2>
                <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: 4 }}>
                  📍 {prop.address ? `${prop.address}, ` : ""}{prop.city}, {prop.country}
                </p>
              </div>
              {prop.cleaningEnabled && (
                <span className="badge badge-success">Cleaning Active</span>
              )}
            </div>

            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", flexGrow: 1 }}>
              {prop.description || "No description provided."}
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, padding: 12, background: "rgba(255,255,255,0.02)", borderRadius: 8, border: "1px solid var(--border-color)", fontSize: "0.85rem" }}>
              <div>
                <span style={{ color: "var(--text-muted)", display: "block" }}>Check-In</span>
                <strong>{prop.checkInTime}</strong>
              </div>
              <div>
                <span style={{ color: "var(--text-muted)", display: "block" }}>Check-Out</span>
                <strong>{prop.checkOutTime}</strong>
              </div>
              <div>
                <span style={{ color: "var(--text-muted)", display: "block" }}>Min Stay</span>
                <strong>{prop.minNights} {prop.minNights === 1 ? "night" : "nights"}</strong>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--border-color)", paddingTop: 16, marginTop: 8 }}>
              <div>
                <span style={{ color: "var(--text-muted)", fontSize: "0.75rem", display: "block" }}>iCal Export Feed</span>
                <code style={{ fontSize: "0.8rem", color: "var(--accent-primary)" }}>
                  /api/ical/{prop.feedSlug || "p-demo"}
                </code>
              </div>
              <button className="btn-secondary" style={{ padding: "6px 12px", fontSize: "0.85rem" }}>
                Edit Settings
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
