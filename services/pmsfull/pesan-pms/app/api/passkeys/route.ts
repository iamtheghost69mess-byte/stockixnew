import { NextResponse } from "next/server";
import { db } from "@/db";
import { passkey } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth, handleApiError } from "@/lib/auth-server";

// Explicitly set runtime to nodejs
export const runtime = "nodejs";

export async function GET() {
  try {
    // Check if the user is authenticated
    const { session, error } = await requireAuth();
    if (error) return error;

    // Fetch passkeys for the current user
    const userPasskeys = await db.query.passkey.findMany({
      where: eq(passkey.userId, session.user.id),
    });

    // Format the passkeys for the response
    const formattedPasskeys = userPasskeys.map(pk => ({
      id: pk.id,
      name: pk.name,
      deviceType: pk.deviceType,
      createdAt: pk.createdAt,
    }));

    return NextResponse.json({ passkeys: formattedPasskeys });
  } catch (error) {
    return handleApiError(error, "Failed to fetch passkeys");
  }
}
