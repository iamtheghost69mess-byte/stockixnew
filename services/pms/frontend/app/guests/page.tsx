import { pmsFetch } from "@/lib/pms-client";

interface Guest {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  nationality?: string;
  dateOfBirth?: string;
  idType?: string;
  idNumber?: string;
  passportNumber?: string;
  passportExpiry?: string;
  issuedBy?: string;
  visaNumber?: string;
  visaFrom?: string;
  visaTo?: string;
  hasVisa: boolean;
}

export default async function GuestsPage() {
  const res = await pmsFetch("/api/guests");
  let guests: Guest[] = [];

  if (res.ok) {
    try {
      const data = await res.json();
      guests = data.guests || [];
    } catch {
      guests = [];
    }
  }

  // Fallback demo guests for visualization
  const displayGuests = guests.length > 0 ? guests : [
    {
      id: "g-1",
      name: "Alice Smith",
      email: "alice@example.com",
      phone: "+1 555-0199",
      nationality: "British",
      dateOfBirth: "1988-04-12",
      idType: "passport",
      idNumber: "UK-991208B",
      passportNumber: "UK-991208B",
      passportExpiry: "2032-12-01",
      issuedBy: "HMPO",
      hasVisa: false
    },
    {
      id: "g-2",
      name: "Bob Johnson",
      email: "bob@example.com",
      phone: "+1 555-0143",
      nationality: "Canadian",
      dateOfBirth: "1992-09-24",
      idType: "visa",
      idNumber: "CA-881273C",
      passportNumber: "CA-881273C",
      passportExpiry: "2030-05-15",
      issuedBy: "PPT Canada",
      visaNumber: "V-99123-A",
      visaFrom: "2026-05-01",
      visaTo: "2026-08-01",
      hasVisa: true
    }
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: "2rem", marginBottom: 6 }}>Guest Compliance Profiles</h1>
          <p style={{ color: "var(--text-secondary)" }}>Track national compliance records, passport details, visa dates, and check-in documentation.</p>
        </div>
        <button className="btn-primary">
          <span>+</span> Add Guest Record
        </button>
      </div>

      <div className="glass-card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="table-container">
          <table className="premium-table">
            <thead>
              <tr>
                <th>Guest Details</th>
                <th>Nationality</th>
                <th>Identity Document</th>
                <th>Visa Status</th>
                <th>Date of Birth</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayGuests.map((guest) => (
                <tr key={guest.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{guest.name}</div>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                      📧 {guest.email || "No email"} • 📞 {guest.phone || "No phone"}
                    </div>
                  </td>
                  <td>
                    <span style={{ fontStyle: "italic", color: guest.nationality ? "inherit" : "var(--text-muted)" }}>
                      {guest.nationality || "Not specified"}
                    </span>
                  </td>
                  <td>
                    {guest.idType ? (
                      <div>
                        <span className="badge badge-info" style={{ fontSize: "0.65rem", padding: "2px 6px", marginRight: 8 }}>
                          {guest.idType.toUpperCase()}
                        </span>
                        <code style={{ fontSize: "0.85rem", color: "var(--accent-primary)" }}>
                          {guest.idNumber || guest.passportNumber}
                        </code>
                        {guest.passportExpiry && (
                          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 2 }}>
                            Expires: {guest.passportExpiry}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span style={{ color: "var(--text-muted)" }}>No documents loaded</span>
                    )}
                  </td>
                  <td>
                    {guest.hasVisa ? (
                      <div>
                        <span className="badge badge-success" style={{ fontSize: "0.65rem", padding: "2px 6px" }}>Active Visa</span>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 4 }}>
                          No: {guest.visaNumber} ({guest.visaFrom} to {guest.visaTo})
                        </div>
                      </div>
                    ) : (
                      <span className="badge badge-secondary" style={{ fontSize: "0.65rem", padding: "2px 6px" }}>Not Required / None</span>
                    )}
                  </td>
                  <td>
                    <span style={{ fontSize: "0.9rem" }}>{guest.dateOfBirth || "—"}</span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button className="btn-secondary" style={{ padding: "6px 12px", fontSize: "0.8rem" }}>
                      View Files
                    </button>
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
