"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
	Braces,
	Code2,
	Webhook,
} from "lucide-react";

import Link from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AccessGate } from "@/components/access-gate";
import { OpenApiViewer } from "@/components/openapi-viewer";
import { PlatformOverviewCrumb } from "@/components/platform-overview-crumb";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { mutationErrorMessage } from "@/lib/mutation-error-message";
import { P } from "@/lib/permissions";
import { platformJson } from "@/lib/platform-http";

const WEBHOOK_PRESETS: Record<
	string,
	{ label: string; eventType: string; payload: Record<string, unknown> }
> = {
	ping: {
		label: "Ping / Heartbeat",
		eventType: "developer.ping",
		payload: { source: "saas-dash", note: "Sample correlation footprint" },
	},
	order: {
		label: "Order Event",
		eventType: "order.sample",
		payload: {
			orderId: "demo-order-77",
			total: 42.5,
			currency: "USD",
			items: 3,
		},
	},
	compliance: {
		label: "Compliance Trigger",
		eventType: "compliance.sample",
		payload: { kind: "export_ready", reference: "gdpr-ref-abc" },
	},
};

/**
 * Modernized Developer Ecosystem Gateway.
 * Provides specialized technical views, including live OpenAPI discovery,
 * webhook simulation labs.
 * Unified under professional platform aesthetics.
 */
export default function DevelopersPage() {
	const qc = useQueryClient();

	const [whOrg, setWhOrg] = useState("");
	const [whEndpoint, setWhEndpoint] = useState("");
	const [whPreset, setWhPreset] = useState("ping");
	const [whEvent, setWhEvent] = useState(WEBHOOK_PRESETS.ping.eventType);
	const [whPayload, setWhPayload] = useState(
		JSON.stringify(WEBHOOK_PRESETS.ping.payload, null, 2),
	);


	useEffect(() => {
		const p = WEBHOOK_PRESETS[whPreset];
		if (p) {
			setWhEvent(p.eventType);
			setWhPayload(JSON.stringify(p.payload, null, 2));
		}
	}, [whPreset]);

	const outboxM = useMutation({
		mutationFn: async () => {
			let payload: unknown;
			try {
				payload = JSON.parse(whPayload || "{}");
			} catch {
				throw new Error("Payload must be valid JSON.");
			}
			return platformJson("/webhooks/outbox", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					organizationId: whOrg.trim(),
					endpointId: whEndpoint.trim(),
					eventType: whEvent.trim(),
					payload,
				}),
				idempotencyKey: crypto.randomUUID(),
			});
		},
		onSuccess: () => {
			toast.success("Outbound signal enqueued.");
			void qc.invalidateQueries({
				queryKey: ["platform", "webhooks", "outbox"],
			});
		},
		onError: (e) =>
			toast.error(mutationErrorMessage(e, "Signal injection failed")),
	});

	return (
		<AccessGate permission={P.ORG_READ}>
			<div className="space-y-6">
				<PlatformOverviewCrumb section="Technical" />

				<div className="font-outfit">
					<h1 className="text-2xl font-bold tracking-tight">Developer Suite</h1>
					<p className="text-sm text-muted-foreground mt-1">
						Execute integration tooling and explore the platform API.
					</p>
				</div>

				<Tabs defaultValue="openapi" className="w-full">
					<TabsList className="bg-muted/50 p-1 rounded-xl mb-6">
						<TabsTrigger value="openapi" className="rounded-lg gap-2">
							<Braces className="h-4 w-4" />
							API Specs
						</TabsTrigger>
						<TabsTrigger value="webhooks" className="rounded-lg gap-2">
							<Webhook className="h-4 w-4" />
							Webhooks Lab
						</TabsTrigger>
					</TabsList>

					<TabsContent value="openapi" className="mt-0 outline-none">
						<Card className="border-primary/10 shadow-sm">
							<CardHeader>
								<div className="flex items-center gap-3">
									<div className="p-2 bg-primary/10 rounded-lg text-primary">
										<Code2 className="h-5 w-5" />
									</div>
									<div>
										<CardTitle>OpenAPI Discovery</CardTitle>
										<CardDescription>
											Live exploration of the Platform V1 surface area.
										</CardDescription>
									</div>
								</div>
							</CardHeader>
							<CardContent className="min-h-[400px]">
								<OpenApiViewer />
							</CardContent>
						</Card>
					</TabsContent>

					<TabsContent value="webhooks" className="mt-0 outline-none space-y-6">
						<Card className="shadow-sm">
							<CardHeader>
								<CardTitle>Outbound Signal Lab</CardTitle>
								<CardDescription>
									Surgically inject events into the platform's delivery flux.
								</CardDescription>
							</CardHeader>
							<CardContent className="space-y-4 max-w-2xl">
								<div className="grid gap-4 sm:grid-cols-2">
									<div className="space-y-2">
										<Label className="text-xs font-bold uppercase opacity-60">
											Organization ID
										</Label>
										<Input
											value={whOrg}
											onChange={(e) => setWhOrg(e.target.value)}
											placeholder="Required"
											className="font-mono text-sm bg-muted/30"
										/>
									</div>
									<div className="space-y-2">
										<Label className="text-xs font-bold uppercase opacity-60">
											Endpoint _id
										</Label>
										<Input
											value={whEndpoint}
											onChange={(e) => setWhEndpoint(e.target.value)}
											placeholder="Required"
											className="font-mono text-sm bg-muted/30"
										/>
									</div>
								</div>
								<div className="space-y-2">
									<Label>Quick Presets</Label>
									<Select value={whPreset} onValueChange={setWhPreset}>
										<SelectTrigger className="bg-muted/30">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{Object.entries(WEBHOOK_PRESETS).map(([k, v]) => (
												<SelectItem key={k} value={k}>
													{v.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
								<div className="space-y-2">
									<Label className="text-xs font-bold uppercase opacity-60">
										JSON Payload
									</Label>
									<Textarea
										className="font-mono text-xs min-h-[160px] bg-muted/30"
										value={whPayload}
										onChange={(e) => setWhPayload(e.target.value)}
									/>
								</div>
								<AlertDialog>
									<AlertDialogTrigger asChild>
										<Button
											disabled={
												!whOrg.trim() || !whEndpoint.trim() || outboxM.isPending
											}
										>
											{outboxM.isPending ? "Injecting..." : "Inject Signal"}
										</Button>
									</AlertDialogTrigger>
									<AlertDialogContent>
										<AlertDialogHeader>
											<AlertDialogTitle>
												Execute outbox injection?
											</AlertDialogTitle>
											<AlertDialogDescription>
												This will dispatch a real signal to the selected
												endpoint. Useful for verifying consumer listeners.
											</AlertDialogDescription>
										</AlertDialogHeader>
										<AlertDialogFooter>
											<AlertDialogCancel disabled={outboxM.isPending}>
												Cancel
											</AlertDialogCancel>
											<AlertDialogAction
												disabled={outboxM.isPending}
												onClick={() => outboxM.mutate()}
											>
												Confirm Injection
											</AlertDialogAction>
										</AlertDialogFooter>
									</AlertDialogContent>
								</AlertDialog>
							</CardContent>
						</Card>
					</TabsContent>
				</Tabs>
			</div>
		</AccessGate>
	);
}
