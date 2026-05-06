import { NextResponse } from "next/server";
import { z } from "zod";
import { apiFetch } from "@/lib/api-client";

const schema = z.object({
  token: z.string().uuid(),
  password: z
    .string()
    .min(12)
    .regex(/[A-Z]/, "Must include at least one uppercase letter")
    .regex(/[a-z]/, "Must include at least one lowercase letter")
    .regex(/[0-9]/, "Must include at least one number")
    .regex(/[^A-Za-z0-9]/, "Must include at least one special character"),
});

export async function POST(req: Request) {
  let input: z.infer<typeof schema>;
  try {
    input = schema.parse(await req.json());
  } catch {
    return NextResponse.json(
      {
        error:
          "Password must be at least 12 characters and include uppercase, lowercase, number, and special character.",
      },
      { status: 400 },
    );
  }

  try {
    const res = await apiFetch("/auth/invite/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "auth_upstream_unavailable" }, { status: 503 });
  }
}
