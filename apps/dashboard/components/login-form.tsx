"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { OwnerAuthOtpInput } from "@/components/shadcn-studio/input-otp/input-otp-01";
import { Button } from "@/components/ui/button";
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
import { Eye, EyeOff } from "lucide-react";
import { resetMeCache } from "@/hooks/use-me";
import { cn } from "@/lib/utils";

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [needsMfa, setNeedsMfa] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const passwordUpdated = params.get("reset") === "1";

  useEffect(() => {
    setNeedsMfa(false);
    setMfaCode("");
    setError("");
  }, [email, password]);

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      let lastError = "";
      for (let attempt = 0; attempt < 6; attempt++) {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            password,
            mfaCode: needsMfa ? mfaCode.trim() || undefined : undefined,
          }),
        });
        const data = (await res.json()) as {
          error?: string;
          requiresMfa?: boolean;
          retryable?: boolean;
        };
        if (res.status === 503 && data.retryable && attempt < 5) {
          lastError = "Control plane is starting — retrying…";
          setError(lastError);
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        if (!res.ok) {
          if (data.error === "mfa_required") {
            setNeedsMfa(true);
            setError("");
            return;
          }
          setError(data.error ?? "Invalid credentials");
          return;
        }
        resetMeCache();
        // Full-page navigation so the server layout re-reads the freshly set
        // auth cookie before rendering protected routes. A client-side
        // router.push races the cookie commit and can land on a blank/cached
        // RSC payload that requires a manual refresh to recover.
        const rawFrom = params.get("from") ?? "";
        let destination = "/";
        if (rawFrom) {
          try {
            const parsed = new URL(rawFrom, window.location.origin);
            if (parsed.origin === window.location.origin) destination = rawFrom;
          } catch {
            // malformed URL — fall back to "/"
          }
        }
        window.location.replace(destination);
        return;
      }
      setError(
        lastError ||
          "Control-plane API is not reachable. From the repo root run `pnpm dev` and wait for “API ready”.",
      );
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={cn("flex w-full max-w-md flex-col gap-6", className)} {...props}>
      <Card className="border-border/80 shadow-sm">
        <CardHeader className="space-y-1 text-center pb-2">
          <CardTitle className="text-xl font-semibold tracking-tight">
            Stockix owner access
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Sign in to the platform administration dashboard
          </CardDescription>
        </CardHeader>
        <CardContent>
          {passwordUpdated ? (
            <p className="mb-5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-center text-sm text-emerald-800 dark:text-emerald-200">
              Your password was updated. Sign in with your new password.
            </p>
          ) : null}
          <form onSubmit={(e) => void handleSubmit(e)}>
            <FieldGroup className="gap-5">
              <Field>
                <FieldLabel htmlFor="login-email">Work email</FieldLabel>
                <Input
                  id="login-email"
                  type="email"
                  placeholder="you@company.com"
                  autoComplete="email"
                  autoFocus={!needsMfa}
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                />
              </Field>
              <Field>
                <div className="flex items-center justify-between gap-2">
                  <FieldLabel htmlFor="login-password">Password</FieldLabel>
                  <Link
                    href="/forgot-password"
                    className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <Input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </Field>

              {needsMfa ? (
                <Field className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                  <p className="text-sm font-medium text-foreground">Second step required</p>
                  <FieldDescription className="mb-3">
                    This account has multi-factor authentication enabled. Enter the 6-digit code
                    from your authenticator app.
                  </FieldDescription>
                  <OwnerAuthOtpInput
                    label="Authenticator code"
                    value={mfaCode}
                    onChange={setMfaCode}
                    disabled={loading}
                  />
                  <FieldDescription className="pt-1">
                    Codes refresh every few seconds; wait for the next one if the previous was
                    rejected.
                  </FieldDescription>
                </Field>
              ) : null}

              {error ? (
                <p className="text-sm font-medium text-destructive" role="alert">
                  {error}
                </p>
              ) : null}

              <Field>
                <Button type="submit" className="w-full" size="lg" disabled={loading}>
                  {loading ? "Signing in…" : needsMfa ? "Verify and continue" : "Sign in"}
                </Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
      <FieldDescription className="px-2 text-center text-xs text-muted-foreground">
        Access is limited to authorized Stockix platform operators. Need help? Contact your
        organization administrator.
      </FieldDescription>
    </div>
  );
}
