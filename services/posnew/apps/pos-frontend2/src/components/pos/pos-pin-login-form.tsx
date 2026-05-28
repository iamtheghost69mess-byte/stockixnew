"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import { REGEXP_ONLY_DIGITS } from "input-otp";
import { Delete, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { savePosAccessToken, savePosRefreshToken } from "@/lib/pos-api-fetch";
import { PosLoginError, posLoginWithPin } from "@/lib/pos-auth-api";
import { isHostessUser } from "@/lib/pos-staff-role";
import { posUserFromLoginData } from "@/lib/pos-auth-user";
import { cn } from "@/lib/utils";
import { usePosAuthStore } from "@/stores/pos-auth-store";

export function PosPinLoginForm() {
  const maxPinLength = 6;
  const router = useRouter();
  const setSession = usePosAuthStore((s) => s.setSession);
  const fetchMe = usePosAuthStore((s) => s.fetchMe);

  const [pin, setPin] = useState("");
  const [pending, setPending] = useState(false);
  const [deviceBlockMessage, setDeviceBlockMessage] = useState<string | null>(null);
  const [lockRemainingSeconds, setLockRemainingSeconds] = useState<number>(0);

  const lockActive = lockRemainingSeconds > 0;
  const pinDisabled = pending || lockActive || Boolean(deviceBlockMessage);

  useEffect(() => {
    if (!lockActive) return undefined;
    const timer = globalThis.window.setInterval(() => {
      setLockRemainingSeconds((current) => (current > 0 ? current - 1 : 0));
    }, 1000);
    return () => {
      globalThis.window.clearInterval(timer);
    };
  }, [lockActive]);

  const lockRemainingLabel = useMemo(() => {
    const minutes = Math.floor(lockRemainingSeconds / 60);
    const seconds = lockRemainingSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }, [lockRemainingSeconds]);

  const handleSubmit = async () => {
    if (pinDisabled) return;
    if (pin.length < 4) {
      toast.warning("PIN must be at least 4 digits.");
      return;
    }
    setPending(true);
    try {
      setDeviceBlockMessage(null);
      // 1. Backend sets httpOnly cookies (accessToken, refreshToken)
      const body = await posLoginWithPin(pin);
      if (body.accessToken) {
        savePosAccessToken(body.accessToken);
      }
      if (body.refreshToken) {
        savePosRefreshToken(body.refreshToken);
      }

      // 2. Optimistically set user from login response data
      const fromLogin = posUserFromLoginData(body.data);
      setSession(fromLogin);

      // 3. Refresh full profile and permissions from /api/auth/session (cookies / dev bearer)
      try {
        await fetchMe();
      } catch {
        toast.message("Signed in; profile will refresh when you open the dashboard.");
      }

      const sessionUser = usePosAuthStore.getState().user ?? fromLogin;
      const displayName = sessionUser?.name ?? "";
      toast.success(displayName ? `Welcome back, ${displayName}.` : "Signed in.");

      router.replace(isHostessUser(sessionUser) ? "/dashboard/floor" : "/pos");
      router.refresh();
    } catch (e) {
      if (e instanceof PosLoginError) {
        if (e.code === "DEVICE_PENDING") {
          setDeviceBlockMessage("This device is not authorized. Please contact your manager.");
          toast.error("This device is not authorized. Please contact your manager.");
        } else if (e.code === "DEVICE_REVOKED") {
          setDeviceBlockMessage("This device has been revoked. Please contact your manager.");
          toast.error("This device has been revoked. Please contact your manager.");
        } else if (e.code === "INVALID_PIN" && typeof e.remainingAttempts === "number") {
          toast.error(`Incorrect PIN. ${e.remainingAttempts} attempts remaining.`);
        } else if (e.code === "ACCOUNT_LOCKED") {
          const remainingSeconds =
            typeof e.remainingSeconds === "number" && e.remainingSeconds > 0
              ? e.remainingSeconds
              : 15 * 60;
          setLockRemainingSeconds(remainingSeconds);
          toast.error(`Account locked. Try again in ${Math.ceil(remainingSeconds / 60)} minutes.`);
        } else {
          toast.error(e.message || "Login failed.");
        }
      } else {
        toast.error(e instanceof Error ? e.message : "Login failed.");
      }
      setPin("");
    } finally {
      setPending(false);
    }
  };

  const pinReady = pin.length >= 4 && !pinDisabled;
  const pinDigits = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

  const handleAppendDigit = useCallback(
    (digit: number) => {
      if (pinDisabled || pin.length >= maxPinLength) return;
      setPin((current) => (current.length >= maxPinLength ? current : `${current}${digit}`));
    },
    [pin, pinDisabled]
  );

  const handleClearPin = useCallback(() => {
    if (pinDisabled) return;
    setPin("");
  }, [pinDisabled]);

  const handleDeleteLastDigit = useCallback(() => {
    if (pinDisabled || pin.length === 0) return;
    setPin((current) => current.slice(0, -1));
  }, [pin, pinDisabled]);

  return (
    <Card className="relative mx-auto flex max-h-[calc(100dvh-1.5rem)] w-full max-w-md flex-col overflow-hidden border-border bg-card text-card-foreground shadow-xl sm:max-h-[calc(100dvh-2rem)]">
      <div className="pointer-events-none absolute inset-x-0 -top-24 h-52 bg-primary/10 blur-3xl" />

      <CardHeader className="space-y-4 border-border/60 border-b pb-5 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md">
          <Loader2 className={cn("size-5", pending ? "animate-spin" : "")} />
        </div>
        <div className="space-y-1">
          <CardTitle className="font-semibold text-2xl tracking-tight">Terminal Login</CardTitle>
          <CardDescription className="text-muted-foreground text-sm">Secure PIN authentication</CardDescription>
        </div>
        <div className="inline-flex items-center justify-center gap-2 font-medium text-muted-foreground text-xs">
          <ShieldCheck className="size-4" />
          <span>Enterprise POS v2</span>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-6 overflow-y-auto py-6">
        <div className="space-y-4">
          {deviceBlockMessage ? (
            <Alert variant="destructive">
              <AlertTitle>Device authorization required</AlertTitle>
              <AlertDescription>{deviceBlockMessage}</AlertDescription>
            </Alert>
          ) : null}

          {lockActive ? (
            <Alert className="border-amber-500/30 bg-amber-50 text-amber-950 dark:bg-amber-500/10 dark:text-amber-100">
              <AlertTitle>Account locked</AlertTitle>
              <AlertDescription>
                Try again in {Math.ceil(lockRemainingSeconds / 60)} minutes.
                <div className="mt-1 font-mono text-xs opacity-90">{lockRemainingLabel}</div>
              </AlertDescription>
            </Alert>
          ) : null}

          {!deviceBlockMessage ? (
            <div className="space-y-4">
              <div className="space-y-2 text-center">
                <Label
                  htmlFor="pos-pin-otp"
                  className="justify-center font-semibold text-muted-foreground text-xs uppercase tracking-[0.18em]"
                >
                  Identification Number
                </Label>
                <Separator className="mx-auto w-20" />
              </div>

              <div className="flex justify-center">
                <InputOTP
                  id="pos-pin-otp"
                  maxLength={maxPinLength}
                  pattern={REGEXP_ONLY_DIGITS}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={pin}
                  onChange={setPin}
                  disabled={pinDisabled}
                  containerClassName="gap-2"
                >
                  <InputOTPGroup className="gap-2">
                    {[0, 1, 2].map((idx) => (
                      <InputOTPSlot
                        key={idx}
                        index={idx}
                        mask
                        className="size-12 rounded-lg border-border bg-background font-semibold text-xl"
                      />
                    ))}
                  </InputOTPGroup>
                  <InputOTPSeparator className="text-muted-foreground" />
                  <InputOTPGroup className="gap-2">
                    {[3, 4, 5].map((idx) => (
                      <InputOTPSlot
                        key={idx}
                        index={idx}
                        mask
                        className="size-12 rounded-lg border-border bg-background font-semibold text-xl"
                      />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>
            </div>
          ) : null}
        </div>

        {!deviceBlockMessage ? (
          <div className="mt-auto">
            <div className="mx-auto grid max-w-[320px] grid-cols-3 gap-2">
              {pinDigits.map((digit) => (
                <Button
                  key={digit}
                  type="button"
                  variant="outline"
                  size="lg"
                  disabled={pinDisabled || pin.length >= maxPinLength}
                  onClick={() => handleAppendDigit(digit)}
                  className="h-12 font-semibold text-lg"
                >
                  {digit}
                </Button>
              ))}

              <Button
                type="button"
                variant="secondary"
                size="lg"
                disabled={pinDisabled}
                onClick={handleClearPin}
                className="h-12 font-semibold text-xs uppercase tracking-[0.16em]"
              >
                Clear
              </Button>

              <Button
                type="button"
                variant="outline"
                size="lg"
                disabled={pinDisabled || pin.length >= maxPinLength}
                onClick={() => handleAppendDigit(0)}
                className="h-12 font-semibold text-lg"
              >
                0
              </Button>

              <Button
                type="button"
                variant="outline"
                size="lg"
                disabled={pinDisabled || pin.length === 0}
                onClick={handleDeleteLastDigit}
                className="h-12"
                aria-label="Delete last digit"
              >
                <Delete className="size-5 text-foreground" />
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>

      <CardFooter className="flex flex-col gap-4 border-border/60 border-t pt-5">
        <Button
          type="button"
          size="lg"
          disabled={pinDisabled || !pinReady}
          onClick={() => void handleSubmit()}
          className={cn("h-12 w-full font-semibold text-sm uppercase tracking-[0.18em]", pending && "pointer-events-none")}
        >
          {pending ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              Authorizing...
            </span>
          ) : (
            "Access Terminal"
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}
