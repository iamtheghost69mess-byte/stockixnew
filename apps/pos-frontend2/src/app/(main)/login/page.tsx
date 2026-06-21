import type { Metadata } from "next";

import { PosPinLoginForm } from "@/components/pos/pos-pin-login-form";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Staff PIN sign-in",
};

export default function LoginPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-black p-6">
      <PosPinLoginForm />
    </div>
  );
}
