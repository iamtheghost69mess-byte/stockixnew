import type { Metadata } from "next";
import { headers } from "next/headers";

import { dashboardConfig } from "@repo/config";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const headerStore = await headers();
  const cookie = headerStore.get("cookie") ?? "";

  try {
    const res = await fetch(`${dashboardConfig.nextPublicApiUrl}/tenants/${id}`, {
      headers: {
        Authorization: `Bearer ${dashboardConfig.platformApiSecret}`,
        ...(cookie ? { Cookie: cookie } : {}),
      },
      cache: "no-store",
    });
    if (res.ok) {
      const data = (await res.json()) as { tenant?: { name?: string } };
      if (data.tenant?.name) {
        return { title: `${data.tenant.name} — Tenant` };
      }
    }
  } catch {
    /* fallback title */
  }

  return { title: "Tenant detail" };
}

export default function TenantDetailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
