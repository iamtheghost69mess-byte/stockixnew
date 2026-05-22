"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, Plus, ShieldCheck, Webhook } from "lucide-react";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { invalidateQueriesEverywhere } from "@/lib/invalidate-queries-everywhere";
import { mutationErrorMessage } from "@/lib/mutation-error-message";
import { platformJson } from "@/lib/platform-http";

export function RegisterWebhookDialog() {
	const [open, setOpen] = useState(false);
	const [orgId, setOrgId] = useState("");
	const [url, setUrl] = useState("");
	const [secret, setSecret] = useState<string | null>(null);
	const qc = useQueryClient();

	const createM = useMutation({
		mutationFn: () =>
			platformJson<{ data?: { signingSecretCurrent?: string } }>(
				"/webhooks/endpoints",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						organizationId: orgId.trim(),
						url: url.trim(),
					}),
					idempotencyKey: crypto.randomUUID(),
				},
			),
		onSuccess: (j) => {
			setSecret(j.data?.signingSecretCurrent || null);
			toast.success("Endpoint registered successfully.");
			invalidateQueriesEverywhere(qc, "webhookEndpoint");
		},
		onError: (e) => toast.error(mutationErrorMessage(e, "Registration failed")),
	});

	const onReset = () => {
		setSecret(null);
		setOrgId("");
		setUrl("");
		setOpen(false);
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(v) => {
				if (!v && secret) {
					if (confirm("Have you copied the secret? It won't be shown again."))
						onReset();
				} else if (!v) onReset();
				else setOpen(v);
			}}
		>
			<DialogTrigger asChild>
				<Button className="font-outfit gap-2">
					<Plus className="h-4 w-4" />
					Register Endpoint
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Webhook className="h-5 w-5 text-primary" />
						{secret ? "Signing Secret Issued" : "New Webhook Observer"}
					</DialogTitle>
					<DialogDescription>
						{secret
							? "Platform events to this URL will be signed with this secret. Seal it in your environment."
							: "Define the destination for outbound platform event signals."}
					</DialogDescription>
				</DialogHeader>

				{!secret ? (
					<div className="space-y-4 py-4">
						<div className="space-y-2">
							<Label>Target Organization ID</Label>
							<Input
								placeholder="ObjectId"
								value={orgId}
								onChange={(e) => setOrgId(e.target.value)}
							/>
						</div>
						<div className="space-y-2">
							<Label>Endpoint URL</Label>
							<Input
								placeholder="https://api.thirdparty.com/webhook"
								value={url}
								onChange={(e) => setUrl(e.target.value)}
							/>
						</div>
						<DialogFooter>
							<Button
								className="w-full"
								onClick={() => createM.mutate()}
								disabled={createM.isPending || !orgId || !url}
							>
								{createM.isPending
									? "Generating..."
									: "Register & Issue Secret"}
							</Button>
						</DialogFooter>
					</div>
				) : (
					<div className="space-y-4 py-4">
						<div className="flex items-center gap-2">
							<div className="grid flex-1 gap-2">
								<Input
									defaultValue={secret}
									readOnly
									className="font-mono text-sm bg-muted/50"
								/>
							</div>
							<Button
								size="icon"
								onClick={() => {
									void navigator.clipboard.writeText(secret);
									toast.success("Secret copied");
								}}
							>
								<Copy className="h-4 w-4" />
							</Button>
						</div>
						<Button variant="outline" className="w-full" onClick={onReset}>
							<ShieldCheck className="mr-2 h-4 w-4" />
							Secret Stored Safely
						</Button>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
