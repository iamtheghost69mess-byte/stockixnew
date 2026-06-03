import { NextResponse } from "next/server";
import { dashboardConfig } from "@repo/config";

export async function GET() {
  const base = dashboardConfig.serverApiUrl?.replace(/\/+$/, "");
  if (!base) {
    return NextResponse.json(
      { mail: { configured: false, fromAddressSet: false } },
      { status: 503 },
    );
  }
  try {
    const res = await fetch(`${base}/health`, { cache: "no-store" });
    const data = (await res.json()) as {
      mail?: { configured?: boolean; fromAddressSet?: boolean };
    };
    return NextResponse.json({
      mail: {
        configured: Boolean(data.mail?.configured),
        fromAddressSet: Boolean(data.mail?.fromAddressSet),
      },
    });
  } catch {
    return NextResponse.json(
      { mail: { configured: false, fromAddressSet: false } },
      { status: 502 },
    );
  }
}
