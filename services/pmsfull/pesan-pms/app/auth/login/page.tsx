"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { authClient, signIn } from "@/lib/auth-client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Fingerprint } from "lucide-react";
import AuthRedirect from "../auth-redirect";
import { Separator } from "@/components/ui/separator";

function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isPasskeyLoading, setIsPasskeyLoading] = useState(false);

  // Check if browser supports conditional UI for passkeys
  const [supportsPasskeyAutofill, setSupportsPasskeyAutofill] = useState(false);

  useEffect(() => {
    // Check if the browser supports conditional UI
    if (
      typeof window !== "undefined" &&
      window.PublicKeyCredential &&
      window.PublicKeyCredential.isConditionalMediationAvailable
    ) {
      window.PublicKeyCredential.isConditionalMediationAvailable().then(
        (available) => {
          setSupportsPasskeyAutofill(available);
          // If supported, preload passkeys for autofill
          if (available) {
            void authClient.signIn.passkey({ autoFill: true });
          }
        }
      );
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const result = await signIn.email({
        email,
        password,
        // Don't use callbackURL, we'll handle the redirect manually
      });

      if (result && result.error) {
        setError(result.error.message || "Invalid email or password");
        setIsLoading(false);
        return;
      }

      // Wait for the session to be established
      // This ensures the session is properly synced before redirecting
      await new Promise(resolve => setTimeout(resolve, 500));

      // Use window.location for a full page navigation instead of router.push
      // This ensures the page is fully reloaded with the new session
      window.location.href = "/dashboard";
    } catch (error: any) {
      console.error("Email sign-in error:", error);
      setError(error.message || "An unexpected error occurred. Please try again.");
      setIsLoading(false);
    }
  };

  const handlePasskeySignIn = async () => {
    setIsPasskeyLoading(true);
    setError("");

    try {
      const result = await authClient.signIn.passkey({
        // Don't use callbackURL, we'll handle the redirect manually
      });

      if (result && result.error) {
        setError(result.error.message || "Passkey authentication failed");
        setIsPasskeyLoading(false);
        return;
      }

      // Wait for the session to be established
      // This ensures the session is properly synced before redirecting
      await new Promise(resolve => setTimeout(resolve, 500));

      // Use window.location for a full page navigation instead of router.push
      // This ensures the page is fully reloaded with the new session
      window.location.href = "/dashboard";
    } catch (error: any) {
      console.error("Passkey sign-in error:", error);
      setError(error.message || "An unexpected error occurred. Please try again.");
      setIsPasskeyLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">Login</CardTitle>
          <CardDescription>
            Enter your email and password to access your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Passkey Sign In Button */}
            <Button
              type="button"
              className="w-full"
              variant="outline"
              onClick={handlePasskeySignIn}
              disabled={isPasskeyLoading}
            >
              <Fingerprint className="mr-2 h-4 w-4" />
              {isPasskeyLoading ? "Authenticating..." : "Sign in with passkey"}
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  Or continue with
                </span>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  name="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username webauthn"
                  required
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Link
                    href="/auth/forgot-password"
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <PasswordInput
                  id="password"
                  name="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password webauthn"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Logging in..." : "Login with password"}
              </Button>
            </form>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col space-y-4">
          <div className="text-sm text-center">
            Don&apos;t have an account?{" "}
            <Link href="/auth/signup" className="font-medium text-primary hover:underline">
              Sign up
            </Link>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}

// Export the page component with AuthRedirect
export default function LoginPage() {
  return (
    <AuthRedirect>
      <LoginForm />
    </AuthRedirect>
  );
}
