"use client";

import { AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PlatformUser } from "@/lib/auth-store";
import { useAuthStore } from "@/lib/auth-store";
import { platformMessage } from "@/lib/messages/platform";
import type { PlatformHttpError } from "@/lib/platform-public-http";
import {
	platformPublicJson,
	savePlatformRefreshToken,
	savePlatformToken,
} from "@/lib/platform-public-http";

export default function LoginPage() {
	const router = useRouter();
	const setSession = useAuthStore((s) => s.setSession);
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [loading, setLoading] = useState(false);
	const [errorMsg, setErrorMsg] = useState("");

	async function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		setLoading(true);
		setErrorMsg("");
		try {
			const json = await platformPublicJson<{
				success?: boolean;
				data?: { user?: PlatformUser };
				message?: string;
				accessToken?: string;
				refreshToken?: string;
			}>("/auth/login", {
				method: "POST",
				body: JSON.stringify({ email, password }),
			});
			if (!json?.success) {
				setErrorMsg(json?.message || platformMessage("auth.invalid"));
				return;
			}
			if (json.accessToken) {
				savePlatformToken(json.accessToken);
			}
			if (json.refreshToken) {
				savePlatformRefreshToken(json.refreshToken);
			}
			setSession(json.data?.user || {});
			router.replace("/");
		} catch (err) {
			const pe = err as PlatformHttpError;
			if (typeof pe?.status === "number") {
				setErrorMsg(
					pe.status === 401 ? platformMessage("auth.invalid") : pe.message,
				);
				return;
			}
			setErrorMsg(platformMessage("network.error"));
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle>Platform sign in</CardTitle>
					<CardDescription>
						Use your platform operator credentials.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={onSubmit} className="flex flex-col gap-4">
						{errorMsg ? (
							<Alert variant="destructive">
								<AlertCircle className="h-4 w-4" />
								<AlertTitle>Authentication Failed</AlertTitle>
								<AlertDescription>{errorMsg}</AlertDescription>
							</Alert>
						) : null}
						<div className="space-y-2">
							<Label htmlFor="email">Email</Label>
							<Input
								id="email"
								type="email"
								autoComplete="email"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								required
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="password">Password</Label>
							<Input
								id="password"
								type="password"
								autoComplete="current-password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								required
								minLength={8}
							/>
						</div>
						<Button type="submit" className="w-full" disabled={loading}>
							{loading ? "Signing in…" : "Sign in"}
						</Button>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
