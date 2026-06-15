import { DashboardAppShell } from "@/components/dashboard-app-shell";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { dashboardConfig } from "@repo/config";
import type { Me } from "@/hooks/use-me";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headerStore = await headers();
  const cookie = headerStore.get("cookie") ?? "";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  let meRes: Response | null = null;
  try {
    meRes = await fetch(`${dashboardConfig.serverApiUrl}/auth/me`, {
      headers: cookie ? { Cookie: cookie } : {},
      cache: "no-store",
      signal: controller.signal,
    });
  } catch {
    meRes = null;
  } finally {
    clearTimeout(timer);
  }
  if (!meRes?.ok) {
    redirect("/login");
  }
  const body = (await meRes.json()) as { me?: Me };
  const initialMe = body.me ?? null;
  return <DashboardAppShell initialMe={initialMe}>{children}</DashboardAppShell>;
}
