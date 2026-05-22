import type { ReactNode } from "react";
import Link from "next/link";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0 }}>
        <header
          style={{
            borderBottom: "1px solid #e5e5e5",
            padding: "12px 20px",
            display: "flex",
            gap: 16,
          }}
        >
          <strong>Stockix PMS</strong>
          <Link href="/properties">Properties</Link>
          <Link href="/rooms">Rooms</Link>
          <Link href="/bookings">Bookings</Link>
          <Link href="/guests">Guests</Link>
        </header>
        <main style={{ padding: 20 }}>{children}</main>
      </body>
    </html>
  );
}
