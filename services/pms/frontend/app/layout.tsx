import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/logo";
import "./globals.css";

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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <div className="sidebar-layout">
          <aside className="sidebar">
            <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 8px" }}>
              <span style={{ display: "inline-flex", filter: "drop-shadow(0 0 8px rgba(0, 229, 255, 0.4))" }}>
                <Logo className="h-6 w-auto shrink-0" />
              </span>
              <span style={{ fontWeight: 700, fontSize: "1.2rem", letterSpacing: "-0.03em" }}>
                STOCKIX <span style={{ color: "var(--accent-primary)" }}>PMS</span>
              </span>
            </Link>
            
            <nav className="sidebar-nav">
              <Link href="/properties" className="nav-item">
                <span>🏢</span> Properties
              </Link>
              <Link href="/rooms" className="nav-item">
                <span>🔑</span> Rooms
              </Link>
              <Link href="/bookings" className="nav-item">
                <span>📅</span> Bookings
              </Link>
              <Link href="/guests" className="nav-item">
                <span>👤</span> Guests
              </Link>
            </nav>
            
            <div style={{ marginTop: "auto", padding: "16px 8px", borderTop: "1px solid var(--border-color)", fontSize: "0.85rem", color: "var(--text-muted)" }}>
              Stockix Engine v0.1.0
            </div>
          </aside>
          
          <main className="content-area">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
