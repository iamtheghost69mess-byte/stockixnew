"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [isRedirecting, setIsRedirecting] = useState(false);

  useEffect(() => {
    // If the session is not loading and there's no session, redirect to login
    if (!isPending && !session && !isRedirecting) {
      setIsRedirecting(true);
      router.push("/auth/login");
    }
  }, [session, isPending, router, isRedirecting]);

  // Show loading state while checking the session
  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
        <p className="ml-4">Loading...</p>
      </div>
    );
  }

  // If there's a session or we're in the process of redirecting, render the children
  // This prevents the redirect loop by allowing the redirect to complete
  if (session || isRedirecting) {
    return <>{children}</>;
  }

  // Return loading state while redirecting
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      <p className="ml-4">Redirecting to login...</p>
    </div>
  );
}
