import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { passkey } from "better-auth/plugins/passkey";
import { db } from "../db";

export const auth = betterAuth({
    database: drizzleAdapter(db, {
        provider: "sqlite",
    }),
    emailAndPassword: {
        enabled: true
    },
    plugins: [
        passkey({
            rpID: process.env.NEXT_PUBLIC_PASSKEY_RP_ID || 'localhost',
            rpName: 'Pesan PMS',
            origin: process.env.NEXT_PUBLIC_PASSKEY_ORIGIN || 'http://localhost:3000',
            authenticatorSelection: {
                residentKey: 'preferred',
                userVerification: 'preferred'
            }
        })
    ]
});