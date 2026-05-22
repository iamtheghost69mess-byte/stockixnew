"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function HomePage() {
  const router = useRouter();
  const { data: session, isPending: isLoading } = authClient.useSession();

  // Redirect to dashboard if logged in
  useEffect(() => {
    if (session) {
      router.push("/dashboard");
    }
  }, [session, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
        <p className="mt-4 text-lg">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Hero Section */}
      <header className="bg-white shadow">
        <div className="container mx-auto px-4 py-6 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-primary">Pesan PMS</h1>
          <div className="space-x-4">
            <Button asChild variant="outline">
              <Link href="/auth/login">Login</Link>
            </Button>
            <Button asChild>
              <Link href="/auth/signup">Sign Up</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="py-20 bg-gradient-to-b from-white to-gray-50">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-4xl font-bold mb-6">Property Management Made Simple</h2>
            <p className="text-xl text-gray-600 mb-10 max-w-3xl mx-auto">
              Pesan PMS is an open-source property management system designed to help manage hotels, homestays, villas, and other accommodation properties.
            </p>
            <Button asChild size="lg">
              <Link href="/auth/signup">Get Started</Link>
            </Button>
          </div>
        </section>

        <section className="py-16 bg-white">
          <div className="container mx-auto px-4">
            <h2 className="text-3xl font-bold mb-12 text-center">Key Features</h2>
            <div className="grid md:grid-cols-3 gap-8">
              <div className="p-6 border rounded-lg shadow-sm">
                <h3 className="text-xl font-semibold mb-3">Booking Management</h3>
                <p className="text-gray-600">Easily manage reservations, check-ins, and check-outs with our intuitive interface.</p>
              </div>
              <div className="p-6 border rounded-lg shadow-sm">
                <h3 className="text-xl font-semibold mb-3">Room Management</h3>
                <p className="text-gray-600">Track room availability, maintenance, and inventory in real-time.</p>
              </div>
              <div className="p-6 border rounded-lg shadow-sm">
                <h3 className="text-xl font-semibold mb-3">Reporting</h3>
                <p className="text-gray-600">Generate detailed financial and occupancy reports to optimize your business.</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-gray-900 text-white py-12">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="mb-6 md:mb-0">
              <h2 className="text-2xl font-bold">Pesan PMS</h2>
              <p className="mt-2 text-gray-400">Open-source property management system</p>
            </div>
            <div className="flex space-x-6">
              <Link href="/auth/login" className="hover:text-primary transition-colors">Login</Link>
              <Link href="/auth/signup" className="hover:text-primary transition-colors">Sign Up</Link>
              <a href="https://github.com/yourusername/pesan-pms" className="hover:text-primary transition-colors" target="_blank" rel="noopener noreferrer">GitHub</a>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-gray-800 text-center text-gray-400">
            <p>© {new Date().getFullYear()} Pesan PMS. Licensed under MIT.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
