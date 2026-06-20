import { NextResponse } from "next/server";
import { apiFetch, LIFECYCLE_TIMEOUT_MS } from "@/lib/api-client";
import { isApiConnectionError } from "@/lib/api-connection";

type Params = { params: Promise<{ tenantId: string }> };

export async function GET(_: Request, { params }: Params) {
  const { tenantId } = await params;
  const res = await apiFetch(`/v1/tenants/${tenantId}`, {}, _);
  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}

export async function PATCH(req: Request, { params }: Params) {
  const { tenantId } = await params;
  const body = await req.text();
  const res = await apiFetch(`/v1/tenants/${tenantId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body,
  }, req);
  const responseBody = await res.text();
  return new NextResponse(responseBody, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const { tenantId } = await params;
    const query = new URL(req.url).search;
    const res = await apiFetch(
      `/tenants/${tenantId}${query}`,
      { method: "DELETE" },
      req,
      undefined,
      LIFECYCLE_TIMEOUT_MS,
    );
    const body = await res.text();
    return new NextResponse(body, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch (error) {
    if (isApiConnectionError(error)) {
      return NextResponse.json(
        {
          error: "control_plane_unavailable",
          message: "Control plane API is unreachable. Retry in a moment — deletion was not started.",
        },
        { status: 503 },
      );
    }
    throw error;
  }
}
