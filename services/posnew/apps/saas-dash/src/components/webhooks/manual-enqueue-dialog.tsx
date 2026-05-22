"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Send, Terminal } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import { invalidateQueriesEverywhere } from "@/lib/invalidate-queries-everywhere";
import { mutationErrorMessage } from "@/lib/mutation-error-message";
import { platformJson } from "@/lib/platform-http";

export function ManualEnqueueDialog() {
	const [open, setOpen] = useState(false);
	const [orgId, setOrgId] = useState("");
	const [endpointId, setEndpointId] = useState("");
	const [eventType, setEventType] = useState("test.manual_ping");
	const [payload, setPayload] = useState('{\n  "hello": "platform"\n}');

	const qc = useQueryClient();

	const enqueueM = useMutation({
		mutationFn: async () => {
			let body: any;
			try {
				body = JSON.parse(payload);
			} catch {
				throw new Error("Payload must be valid JSON.");
			}
			return platformJson("/webhooks/outbox", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					organizationId: orgId.trim(),
					endpointId: endpointId.trim(),
					eventType: eventType.trim(),
					payload: body,
				}),
				idempotencyKey: crypto.randomUUID(),
			});
		},
		onSuccess: () => {
			toast.success("Manual delivery enqueued.");
			setOpen(false);
			invalidateQueriesEverywhere(qc, "webhookOutbox");
		},
		onError: (e) => toast.error(mutationErrorMessage(e, "Enqueue failed")),
	});

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="outline" className="font-outfit gap-2">
					<Terminal className="h-4 w-4" />
					Test Payload
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Send className="h-5 w-5 text-primary" />
						Manual Delivery Enqueue
					</DialogTitle>
					<DialogDescription>
						Bypass automated triggers to surgically test a specific endpoint
						with a custom JSON payload.
					</DialogDescription>
				</DialogHeader>

				<div className="grid gap-4 py-4">
					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<Label>Organization Context</Label>
							<Input
								placeholder="Org ObjectId"
								value={orgId}
								onChange={(e) => setOrgId(e.target.value)}
							/>
						</div>
						<div className="space-y-2">
							<Label>Endpoint Target</Label>
							<Input
								placeholder="Endpoint _id"
								value={endpointId}
								onChange={(e) => setEndpointId(e.target.value)}
							/>
						</div>
					</div>
					<div className="space-y-2">
						<Label>Event Signature</Label>
						<Input
							placeholder="e.g. order.created"
							value={eventType}
							onChange={(e) => setEventType(e.target.value)}
						/>
					</div>
					<div className="space-y-2">
						<Label>JSON Payload</Label>
						<Textarea
							className="font-mono text-xs min-h-[160px] bg-muted/30"
							value={payload}
							onChange={(e) => setPayload(e.target.value)}
						/>
					</div>
				</div>

				<DialogFooter>
					<Button
						className="w-full"
						onClick={() => enqueueM.mutate()}
						disabled={enqueueM.isPending || !orgId || !endpointId}
					>
						{enqueueM.isPending
							? "Injecting into Outbox..."
							: "Enqueue Test Signal"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
