"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { posPublicFetch, savePosAccessToken, savePosRefreshToken } from "@/lib/pos-api-fetch";

function SSOExchange() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setError("No SSO token provided.");
      return;
    }

    const exchangeToken = async () => {
      try {
        const res = await posPublicFetch("/api/auth/sso-exchange", {
          method: "POST",
          body: JSON.stringify({ token }),
        });
        const data = await res.json();

        if (res.ok && data.success) {
          // If we are in dev mode, save to localStorage fallback.
          // In production, the backend sets httpOnly cookies.
          savePosAccessToken(data.accessToken);
          savePosRefreshToken(data.refreshToken);
          
          router.replace("/dashboard");
        } else {
          setError(data.message || "SSO login failed.");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "SSO exchange request failed.");
      }
    };

    void exchangeToken();
  }, [router, searchParams]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background">
        <div className="bg-destructive/10 text-destructive p-4 rounded-md text-center max-w-md">
          <h2 className="font-semibold mb-2">Login Error</h2>
          <p className="text-sm">{error}</p>
          <button 
            onClick={() => router.replace("/login")}
            className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium"
          >
            Go to standard login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
      <p className="text-sm text-muted-foreground">Authenticating via Dashboard SSO...</p>
    </div>
  );
}

export default function SSOPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>}>
      <SSOExchange />
    </Suspense>
  );
}
