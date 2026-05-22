import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

// Explicitly set runtime to nodejs
export const runtime = "nodejs";

export const { POST, GET } = toNextJsHandler(auth);
