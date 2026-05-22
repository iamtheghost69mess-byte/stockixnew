import { redirect } from "next/navigation";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Staff sign-in",
  description: "Redirects to PIN sign-in",
};

export default function StaffLoginPage() {
  redirect("/login");
}
