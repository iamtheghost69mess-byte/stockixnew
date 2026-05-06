"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type InviteInfo = { name: string; email: string };

export default function AcceptInvitePage() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
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
        <Input
          type="password"
          placeholder="Confirm password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          minLength={12}
          required
        />
        <Button className="w-full" disabled={loading}>
          {loading ? "Activating..." : "Activate account"}
        </Button>
      </form>
    </div>
  );
}
