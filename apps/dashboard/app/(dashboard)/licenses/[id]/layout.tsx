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
    const res = await fetch(`${dashboardConfig.serverApiUrl}/licenses/${id}`, {
      headers: {
        Authorization: `Bearer ${dashboardConfig.platformApiSecret}`,
        ...(cookie ? { Cookie: cookie } : {}),
      },
      cache: "no-store",
    });
    if (res.ok) {
      const data = (await res.json()) as { license?: { licenseKey?: string } };
      if (data.license?.licenseKey) {
        return { title: `${data.license.licenseKey} — License` };
      }
    }
  } catch {
    /* fallback title */
  }

  return { title: "License detail" };
}

export default function LicenseDetailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
