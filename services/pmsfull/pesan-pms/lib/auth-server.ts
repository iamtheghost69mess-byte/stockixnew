import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { APIError } from "better-auth/api";

/**
 * Get the current user session from the auth API
 * @returns The user session or null if not authenticated
 */
export async function getSession() {
  try {
    // Use the Better Auth API to get the session
    const session = await auth.api.getSession({
      headers: await headers()
    });

    return session;
  } catch (error) {
    console.error("Error getting session:", error);
    return null;
  }
}

/**
 * Check if the user is authenticated and return an error response if not
 * @returns An object with session and error properties
 */
export async function requireAuth() {
  const session = await getSession();

  if (!session || !session.user) {
    return {
      session: null,
      error: NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    };
  }

  return { session, error: null };
}

/**
 * Handle API errors in a consistent way
 * @param error The error to handle
 * @param defaultMessage The default error message
 * @returns A NextResponse with the error details
 */
export function handleApiError(error: unknown, defaultMessage = "An error occurred") {
  console.error(defaultMessage, error);

  if (error instanceof APIError) {
    return NextResponse.json(
      { error: error.message },
      { status: typeof error.status === 'number' ? error.status : 400 }
    );
  } else if (error instanceof Error) {
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    );
  }

  return NextResponse.json(
    { error: defaultMessage },
    { status: 500 }
  );
}
