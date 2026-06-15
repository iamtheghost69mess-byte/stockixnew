"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { REGEXP_ONLY_DIGITS } from "input-otp";
import { Delete, Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { getPosApiOrigin } from "@/config/pos-api";
import { POS_ACCESS_TOKEN_STORAGE_KEY } from "@/lib/pos-api-fetch";
import { posFetchCurrentUser, posLoginWithPin } from "@/lib/pos-auth-api";

/** Must match `pos-backend/scripts/seedDevStaff.js` (run `npm run seed:dev`). */
const DEV_SEED_PINS: ReadonlyArray<{ role: string; pin: string; name: string }> = [
  { role: "admin", pin: "1001", name: "Dev Admin" },
  { role: "manager", pin: "1002", name: "Dev Manager" },
  { role: "waiter", pin: "1003", name: "Dev Waiter" },
  { role: "cashier", pin: "1004", name: "Dev Cashier" },
  { role: "kitchen", pin: "1005", name: "Dev Kitchen" },
];

export function StaffPinLoginForm() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [pending, setPending] = useState(false);
  const [showPin, setShowPin] = useState(false);

  const handleNumberClick = (num: string) => {
    if (pin.length < 6) setPin((prev) => prev + num);
  };

  const handleClear = () => setPin("");

  const handleDelete = () => setPin((prev) => prev.slice(0, -1));

  const handleSubmit = async () => {
    if (pin.length < 4) {
      toast.warning("PIN must be at least 4 digits.");
      return;
    }
    setPending(true);
    try {
      const body = await posLoginWithPin(pin);
      const token = typeof body.accessToken === "string" ? body.accessToken : null;
      if (token) {
        localStorage.setItem(POS_ACCESS_TOKEN_STORAGE_KEY, token);
      }
      try {
        await posFetchCurrentUser();
      } catch {
        toast.message("Signed in; profile fetch had a hiccup — try opening the dashboard.");
      }
      const name = typeof body.data?.name === "string" ? body.data.name : "there";
      toast.success(`Welcome back, ${name}!`);
      router.push("/pos");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Login failed.");
      setPin("");
    } finally {
      setPending(false);
    }
  };

  const pinReady = pin.length >= 4;
  const apiOrigin = getPosApiOrigin();

  return (
    <Card className="w-full max-w-md border-border shadow-sm">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl">Staff sign-in</CardTitle>
        <CardDescription>
          PIN login for the POS API at <code className="rounded bg-muted px-1 py-0.5 text-xs">{apiOrigin}</code>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
          <AlertTitle className="text-sm">Dev seed users</AlertTitle>
          <AlertDescription className="text-muted-foreground text-xs">
            From <code className="rounded bg-muted px-1">pos-backend</code>:{" "}
            <code className="rounded bg-muted px-1">npm run seed:dev</code>
          </AlertDescription>
          <ul className="mt-2 space-y-1 font-mono text-muted-foreground text-xs">
            {DEV_SEED_PINS.map((row) => (
              <li key={row.role}>
                <span className="text-foreground">{row.pin}</span> — {row.name} ({row.role})
              </li>
            ))}
          </ul>
        </Alert>

        <div className="space-y-2">
          <Label htmlFor="staff-pin-otp" className="text-center text-sm">
            Enter your staff PIN
          </Label>
          <p className="text-center text-muted-foreground text-xs">4–6 digits · Keypad or keyboard</p>
          <div className="flex items-center justify-center gap-3 pt-1">
            <InputOTP
              id="staff-pin-otp"
              maxLength={6}
              pattern={REGEXP_ONLY_DIGITS}
              inputMode="numeric"
              autoComplete="one-time-code"
              value={pin}
              onChange={setPin}
              disabled={pending}
              containerClassName="gap-1 sm:gap-2"
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} mask={!showPin} className="size-11 text-lg sm:size-12 sm:text-xl" />
                <InputOTPSlot index={1} mask={!showPin} className="size-11 text-lg sm:size-12 sm:text-xl" />
                <InputOTPSlot index={2} mask={!showPin} className="size-11 text-lg sm:size-12 sm:text-xl" />
              </InputOTPGroup>
              <InputOTPSeparator />
              <InputOTPGroup>
                <InputOTPSlot index={3} mask={!showPin} className="size-11 text-lg sm:size-12 sm:text-xl" />
                <InputOTPSlot index={4} mask={!showPin} className="size-11 text-lg sm:size-12 sm:text-xl" />
                <InputOTPSlot index={5} mask={!showPin} className="size-11 text-lg sm:size-12 sm:text-xl" />
              </InputOTPGroup>
            </InputOTP>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setShowPin(!showPin)}
              tabIndex={-1}
              aria-label={showPin ? "Hide PIN" : "Show PIN"}
            >
              {showPin ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-muted/20 p-3 sm:p-4">
          <p className="mb-3 text-center font-medium text-muted-foreground text-xs">Keypad</p>
          <div className="mx-auto grid max-w-[272px] grid-cols-3 gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
              <Button
                key={num}
                type="button"
                variant="secondary"
                className="h-14 font-semibold text-lg sm:h-16 sm:text-xl"
                onClick={() => handleNumberClick(String(num))}
                disabled={pending || pin.length >= 6}
              >
                {num}
              </Button>
            ))}
            <Button
              type="button"
              variant="outline"
              className="h-14 font-medium text-xs sm:h-16"
              onClick={handleClear}
              disabled={pending}
            >
              Clear
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="h-14 font-semibold text-lg sm:h-16 sm:text-xl"
              onClick={() => handleNumberClick("0")}
              disabled={pending || pin.length >= 6}
            >
              0
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="h-14 sm:h-16"
              onClick={handleDelete}
              disabled={pending || pin.length === 0}
              aria-label="Delete last digit"
            >
              <Delete className="mx-auto size-5 sm:size-6" />
            </Button>
          </div>
        </div>

        <Button
          type="button"
          className="h-12 w-full gap-2"
          onClick={() => void handleSubmit()}
          disabled={pending || !pinReady}
        >
          {pending ? (
            <>
              <Loader2 className="size-4 shrink-0 animate-spin" />
              Signing in…
            </>
          ) : (
            "Continue"
          )}
        </Button>

        <p className="text-center text-muted-foreground text-xs">
          {pinReady ? "Tap Continue to sign in." : "Enter at least 4 digits, then Continue."}
        </p>
      </CardContent>
    </Card>
  );
}
