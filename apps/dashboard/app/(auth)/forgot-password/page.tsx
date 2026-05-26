"use client";

import Link from "next/link";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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

type ForgotPasswordResponse = {
  error?: string;
  mailConfigured?: boolean;
  emailSent?: boolean;
  accountPending?: boolean;
};

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mailConfigured, setMailConfigured] = useState(true);
  const [emailSent, setEmailSent] = useState(true);
  const [accountPending, setAccountPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/password/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json()) as ForgotPasswordResponse;
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Try again in a moment.");
        return;
      }
      setMailConfigured(data.mailConfigured !== false);
      setEmailSent(data.emailSent !== false);
      setAccountPending(data.accountPending === true);
      setSubmitted(true);
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-6">
      <Card className="border-border/80 shadow-sm">
        <CardHeader className="space-y-1 text-center pb-2">
          <CardTitle className="text-xl font-semibold tracking-tight">
            Reset your password
          </CardTitle>
          <CardDescription>
            Enter the email address associated with your Stockix owner account. If it exists,
            we&apos;ll send reset instructions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {submitted ? (
            <div className="space-y-4 text-center">
              {accountPending ? (
                <Alert className="text-left">
                  <AlertTitle>Accept your invite first</AlertTitle>
                  <AlertDescription>
                    This email is linked to a pending team invitation. Open the invite link from your
                    email to set a password, or ask an administrator to resend the invitation.
                  </AlertDescription>
                </Alert>
              ) : !mailConfigured ? (
                <Alert variant="destructive" className="text-left">
                  <AlertTitle>Email delivery not configured</AlertTitle>
                  <AlertDescription>
                    This environment cannot send password reset emails. Ask your platform administrator
                    to configure SMTP (MAIL_HOST, MAIL_PASSWORD, MAIL_FROM_ADDRESS) or use a development
                    reset link from the API server logs.
                  </AlertDescription>
                </Alert>
              ) : !emailSent ? (
                <Alert variant="destructive" className="text-left">
                  <AlertTitle>Email could not be sent</AlertTitle>
                  <AlertDescription>
                    Mail is configured but delivery failed. Try again later or contact your administrator.
                  </AlertDescription>
                </Alert>
              ) : (
                <p className="text-sm text-muted-foreground leading-relaxed">
                  If an account exists for{" "}
                  <span className="font-medium text-foreground">{email}</span>, you will receive an email
                  with a link to choose a new password. The link expires in one hour.
                </p>
              )}
              {mailConfigured && emailSent ? (
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Check your spam folder if the message does not arrive within a few minutes.
                </p>
              ) : null}
              <Link
                href="/login"
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "inline-flex w-full justify-center",
                )}
              >
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={(e) => void handleSubmit(e)}>
              <FieldGroup className="gap-5">
                <Field>
                  <FieldLabel htmlFor="forgot-email">Work email</FieldLabel>
                  <Input
                    id="forgot-email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@company.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                  />
                  <FieldDescription>
                    Use the same email your administrator invited for platform access.
                  </FieldDescription>
                </Field>
                {error ? (
                  <p className="text-sm font-medium text-destructive" role="alert">
                    {error}
                  </p>
                ) : null}
                <Field className="flex flex-col gap-2">
                  <Button type="submit" className="w-full" size="lg" disabled={loading}>
                    {loading ? "Sending…" : "Send reset link"}
                  </Button>
                  <Link
                    href="/login"
                    className={cn(
                      buttonVariants({ variant: "ghost", size: "lg" }),
                      "inline-flex w-full justify-center",
                    )}
                  >
                    Cancel
                  </Link>
                </Field>
              </FieldGroup>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
