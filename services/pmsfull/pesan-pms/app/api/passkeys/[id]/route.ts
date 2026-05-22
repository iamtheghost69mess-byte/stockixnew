import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { passkey } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireAuth, handleApiError } from "@/lib/auth-server";

// Explicitly set runtime to nodejs
export const runtime = "nodejs";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Check if the user is authenticated
    const { session, error } = await requireAuth();
    if (error) return error;

    const passkeyId = params.id;

    // Verify the passkey belongs to the current user
    const userPasskey = await db.query.passkey.findFirst({
      where: and(
        eq(passkey.id, passkeyId),
        eq(passkey.userId, session.user.id)
      ),
    });

    if (!userPasskey) {
      return NextResponse.json(
        { error: "Passkey not found" },
        { status: 404 }
      );
    }

    // Delete the passkey
    await db.delete(passkey).where(eq(passkey.id, passkeyId));

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete passkey");
  }
}
