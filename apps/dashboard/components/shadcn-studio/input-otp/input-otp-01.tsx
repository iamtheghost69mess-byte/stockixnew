"use client";

import { useId, useState } from "react";

import { REGEXP_ONLY_DIGITS } from "input-otp";

import { InputOTP, InputOTPGroup, InputOTPSlot } from "@repo/ui/input-otp";
import { Label } from "@repo/ui/label";
import { cn } from "@/lib/utils";

export type OwnerAuthOtpInputProps = {
  id?: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  maxLength?: number;
  className?: string;
};

/** Six-digit authenticator code entry (TOTP-style), grouped 3+3. */
export function OwnerAuthOtpInput({
  id,
  label = "Authenticator code",
  value,
  onChange,
  disabled,
  maxLength = 6,
  className,
}: OwnerAuthOtpInputProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;

  return (
    <div className={cn("space-y-3", className)}>
      <Label htmlFor={fieldId}>{label}</Label>
      <InputOTP
        id={fieldId}
        maxLength={maxLength}
        pattern={REGEXP_ONLY_DIGITS}
        value={value}
        onChange={onChange}
        disabled={disabled}
        containerClassName="justify-center sm:justify-start"
      >
        <InputOTPGroup>
          <InputOTPSlot index={0} />
          <InputOTPSlot index={1} />
          <InputOTPSlot index={2} />
        </InputOTPGroup>
        <InputOTPGroup>
          <InputOTPSlot index={3} />
          <InputOTPSlot index={4} />
          <InputOTPSlot index={5} />
        </InputOTPGroup>
      </InputOTP>
    </div>
  );
}

/** @deprecated Use OwnerAuthOtpInput — kept for shadcn-studio demos. */
export default function InputOTPNumberDemo() {
  const [value, setValue] = useState("");
  return <OwnerAuthOtpInput value={value} onChange={setValue} />;
}
