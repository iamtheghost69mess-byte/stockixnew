"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const PASSWORD_HINT =
  "At least 12 characters with uppercase, lowercase, number, and special character.";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (!token) {
      setError("This reset link is missing a token. Open the link from your email again.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(
          data.error ??
            "This link may be invalid or expired. Request a new reset from the sign-in page.",
        );
        return;
      }
      router.push("/login?reset=1");
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <Card className="w-full max-w-md border-border/80 shadow-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-xl font-semibold">Invalid reset link</CardTitle>
          <CardDescription>
            The password reset link is incomplete. Request a new one from the sign-in page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/forgot-password"
            className={cn(buttonVariants({ size: "lg" }), "inline-flex w-full justify-center")}
          >
            Request reset
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-6">
      <Card className="border-border/80 shadow-sm">
        <CardHeader className="space-y-1 text-center pb-2">
          <CardTitle className="text-xl font-semibold tracking-tight">Choose a new password</CardTitle>
          <CardDescription>
            Pick a strong password you don&apos;t use elsewhere. This will sign out other sessions
            for your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void handleSubmit(e)}>
            <FieldGroup className="gap-5">
              <Field>
                <FieldLabel htmlFor="reset-password">New password</FieldLabel>
                <Input
                  id="reset-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                />
                <FieldDescription>{PASSWORD_HINT}</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="reset-password-confirm">Confirm password</FieldLabel>
                <Input
                  id="reset-password-confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  disabled={loading}
                />
              </Field>
              {error ? (
                <p className="text-sm font-medium text-destructive" role="alert">
                  {error}
                </p>
              ) : null}
              <Field className="flex flex-col gap-2">
                <Button type="submit" className="w-full" size="lg" disabled={loading}>
                  {loading ? "Updating…" : "Update password"}
                </Button>
                <Link
                  href="/login"
                  className={cn(
                    buttonVariants({ variant: "ghost", size: "lg" }),
                    "inline-flex w-full justify-center",
                  )}
                >
                  Back to sign in
                </Link>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={<div className="text-sm text-muted-foreground">Loading…</div>}
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
