import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";

import { Logo } from "@/components/logo";

export const metadata: Metadata = {
  title: {
    default: "Stockix PMS",
    template: "%s | Stockix PMS",
  },
  description: "Property Management System by Stockix",
  applicationName: "Stockix PMS",
  authors: [{ name: "Stockix" }],
  icons: {
    icon: [{ url: "/logo.svg", type: "image/svg+xml" }],
  },
  openGraph: {
    title: "Stockix PMS",
    description: "Property Management System by Stockix",
    siteName: "Stockix PMS",
  },
};

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
            alignItems: "center",
          }}
        >
          <Link
            href="/"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <Logo className="h-5 w-auto shrink-0" />
            <span style={{ fontWeight: 600 }}>PMS</span>
          </Link>
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
