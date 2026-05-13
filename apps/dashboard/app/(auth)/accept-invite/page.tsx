"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

type InviteInfo = { name: string; email: string };

function AcceptInviteContent() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/auth/invite/${token}`);
      const data = (await res.json()) as InviteInfo & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Invite not found");
        return;
      }
      setInfo({ name: data.name, email: data.email });
    })();
  }, [token]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not activate account");
        return;
      }
      router.push("/login");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm space-y-4">
      <h1 className="text-xl font-semibold">Accept invitation</h1>
      {info ? (
        <p className="text-sm text-muted-foreground">
          {info.name} ({info.email})
        </p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <form onSubmit={onSubmit} className="space-y-3">
        <Input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={12}
          required
        />
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Activating..." : "Activate account"}
        </Button>
      </form>
    </div>
  );
}

function AcceptInviteFallback() {
  return (
    <div className="w-full max-w-sm space-y-4">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<AcceptInviteFallback />}>
      <AcceptInviteContent />
    </Suspense>
  );
}
