import { NextResponse } from "next/server";

import { apiFetch } from "@/lib/api-client";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ planId: string }> },
) {
  const { planId } = await params;
  const body = await req.text();
  const res = await apiFetch(
    `/plans/${planId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body,
    },
    req,
  );
  const responseBody = await res.text();
  return new NextResponse(responseBody, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ planId: string }> },
) {
  const { planId } = await params;
  const res = await apiFetch(`/plans/${planId}`, { method: "DELETE" }, req);
  const responseBody = await res.text();
  return new NextResponse(responseBody, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}
