"use client";

import { createAuthClient } from "better-auth/react";
import { passkeyClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
    baseURL: process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000",
    plugins: [
        passkeyClient()
    ]
});

export const { signIn, signOut, signUp, useSession } = authClient;
