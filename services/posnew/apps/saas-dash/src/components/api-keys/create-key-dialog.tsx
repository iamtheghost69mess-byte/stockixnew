"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, Key, Plus } from "lucide-react";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { invalidateQueriesEverywhere } from "@/lib/invalidate-queries-everywhere";
import { mutationErrorMessage } from "@/lib/mutation-error-message";
import { platformJson } from "@/lib/platform-http";

/**
 * Professional API Key Provisioning Dialog.
 * Handles the "Secret Reveal Once" pattern required for enterprise security.
 */
export function CreateApiKeyDialog() {
	const [open, setOpen] = useState(false);
	const [label, setLabel] = useState("");
	const [secret, setSecret] = useState<string | null>(null);
	const qc = useQueryClient();

	const createM = useMutation({
		mutationFn: () =>
			platformJson<{ data?: { apiKey?: string } }>("/auth/api-keys", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ label: label.trim() }),
				idempotencyKey: crypto.randomUUID(),
			}),
		onSuccess: (j) => {
			setSecret(j.data?.apiKey || null);
			setLabel("");
			toast.success("API key provisioned successfully.");
			invalidateQueriesEverywhere(qc, "apiKeyCreate");
		},
		onError: (e) => toast.error(mutationErrorMessage(e, "Provisioning failed")),
	});

	const onReset = () => {
		setSecret(null);
		setLabel("");
		setOpen(false);
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(v) => {
				if (!v && secret) {
					// Prevent accidental closing without copying
					if (confirm("Have you copied your key? It cannot be shown again.")) {
						onReset();
					}
				} else if (!v) {
					onReset();
				} else {
					setOpen(v);
				}
			}}
		>
			<DialogTrigger asChild>
				<Button className="font-outfit gap-2">
					<Plus className="h-4 w-4" />
					Provision Key
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Key className="h-5 w-5 text-primary" />
						{secret ? "Key Provisioned" : "New API Capability"}
					</DialogTitle>
					<DialogDescription>
						{secret
							? "This secret is only visible right now. Store it in a secure vault."
							: "Generate a new scoped credential for platform integrations."}
					</DialogDescription>
				</DialogHeader>

				{!secret ? (
					<div className="space-y-4 py-4">
						<div className="space-y-2">
							<Label htmlFor="key-label">Identity Label</Label>
							<Input
								id="key-label"
								placeholder="e.g. Production CI/CD"
								value={label}
								onChange={(e) => setLabel(e.target.value)}
							/>
						</div>
						<Button
							className="w-full"
							onClick={() => createM.mutate()}
							disabled={createM.isPending || !label.trim()}
						>
							{createM.isPending ? "Generating..." : "Generate Secret"}
						</Button>
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
									toast.success("Secret copied to clipboard");
								}}
							>
								<Copy className="h-4 w-4" />
							</Button>
						</div>
						<Button variant="outline" className="w-full" onClick={onReset}>
							I have saved the key securely
						</Button>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
