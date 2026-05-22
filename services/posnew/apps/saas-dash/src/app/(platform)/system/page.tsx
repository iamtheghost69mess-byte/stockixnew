"use client";
import { cn } from "@restaurant-pos/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	Calculator,
	Globe,
	Loader2,
	Plus,
	Rocket,
	Save,
	Settings2,
	Trash2,
	Wrench,
} from "lucide-react";
import { useRouter } from "next/navigation";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AccessGate } from "@/components/access-gate";
import { PlatformOverviewCrumb } from "@/components/platform-overview-crumb";
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
import { Skeleton } from "@/components/ui/skeleton";
import { organizationListResponseSchema } from "@/lib/api-schemas/organizations";
import { invalidateQueriesEverywhere } from "@/lib/invalidate-queries-everywhere";
import { mutationErrorMessage } from "@/lib/mutation-error-message";
import { parseApiResponse } from "@/lib/parse-api-response";
import { P } from "@/lib/permissions";
import { platformJson } from "@/lib/platform-http";
import { qk } from "@/lib/query-keys";

type TaxRow = {
	code: string;
	name: string;
	ratePercent: number;
	kind: "sales" | "withholding";
};

type SystemSettings = {
	supportedCurrencies?: string[];
	defaultCurrency?: string;
	defaultTaxRates?: TaxRow[];
	accountingDefaults?: {
		companyCurrency?: string;
		defaultCostMethod?: string;
		fiscalYearStartMonth?: number;
		stockDeductTrigger?: string;
	};
};

/**
 * Modernized System Control & Global Configuration.
 * Unified under professional platform aesthetics to manage core environment
 * catalog defaults, accounting templates, and bootstrapping.
 */
export default function SystemPage() {
	const qc = useQueryClient();

	const [bootstrapOrgId, setBootstrapOrgId] = useState("");
	const [currenciesText, setCurrenciesText] = useState("");
	const [defaultCurrency, setDefaultCurrency] = useState("USD");
	const [taxRows, setTaxRows] = useState<TaxRow[]>([]);
	const [companyCurrency, setCompanyCurrency] = useState("USD");
	const [costMethod, setCostMethod] = useState("fifo");
	const [fiscalMonth, setFiscalMonth] = useState("1");
	const [stockTrigger, setStockTrigger] = useState("payment");

	const settingsQ = useQuery({
		queryKey: qk.systemOwnerSettings,
		queryFn: async () => {
			const raw = await platformJson<{
				success?: boolean;
				data?: SystemSettings;
			}>("/system-settings");
			return raw.data ?? {};
		},
	});

	const organizationsQ = useQuery({
		queryKey: qk.organizationsList,
		queryFn: async () => {
			const raw = await platformJson<unknown>("/organizations?limit=100");
			return parseApiResponse(
				organizationListResponseSchema,
				raw,
				"organizations for system bootstrap",
			);
		},
		staleTime: 5 * 60 * 1000,
	});

	useEffect(() => {
		const d = settingsQ.data;
		if (!d || settingsQ.isFetching) return;
		setCurrenciesText((d.supportedCurrencies || []).join(", "));
		setDefaultCurrency(d.defaultCurrency || "USD");
		setTaxRows(
			(d.defaultTaxRates || []).map((r) => ({
				code: r.code || "",
				name: r.name || "",
				ratePercent: Number(r.ratePercent) || 0,
				kind: r.kind === "withholding" ? "withholding" : "sales",
			})),
		);
		const ad = d.accountingDefaults || {};
		setCompanyCurrency(ad.companyCurrency || "USD");
		setCostMethod(ad.defaultCostMethod || "fifo");
		setFiscalMonth(String(ad.fiscalYearStartMonth ?? 1));
		setStockTrigger(ad.stockDeductTrigger || "payment");
	}, [settingsQ.data, settingsQ.isFetching]);

	const parsedCurrencies = useMemo(
		() =>
			currenciesText
				.split(/[,;\s]+/)
				.map((s) => s.trim().toUpperCase())
				.filter(Boolean),
		[currenciesText],
	);

	const selectedBootstrapOrg = useMemo(() => {
		const selectedId = bootstrapOrgId.trim();
		if (!selectedId) return null;
		const list = organizationsQ.data?.data || [];
		return (
			list.find((org) => {
				const raw = org._id ?? org.id;
				const id =
					typeof raw === "string"
						? raw.trim()
						: raw != null
							? String(raw).trim()
							: "";
				return id === selectedId;
			}) || null
		);
	}, [bootstrapOrgId, organizationsQ.data?.data]);

	const saveM = useMutation({
		mutationFn: async () => {
			const body: Record<string, unknown> = {
				supportedCurrencies: parsedCurrencies,
				defaultCurrency: defaultCurrency.trim().toUpperCase(),
				defaultTaxRates: taxRows.filter((r) => r.code.trim()),
				accountingDefaults: {
					companyCurrency: companyCurrency.trim().toUpperCase(),
					defaultCostMethod: costMethod,
					fiscalYearStartMonth: Number(fiscalMonth) || 1,
					stockDeductTrigger: stockTrigger,
				},
			};
			return platformJson<{ success?: boolean }>("/system-settings", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
				idempotencyKey: crypto.randomUUID(),
			});
		},
		onSuccess: () => {
			toast.success("Platform environment synchronized.");
			invalidateQueriesEverywhere(qc, "systemSettingsPatch");
		},
		onError: (e) =>
			toast.error(mutationErrorMessage(e, "Synchronization failed")),
	});

	const bootstrapM = useMutation({
		mutationFn: () =>
			platformJson("/bootstrap", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ organizationId: bootstrapOrgId.trim() }),
				idempotencyKey: crypto.randomUUID(),
			}),
		onSuccess: () => {
			toast.success("Bootstrap sequence dispatched to queue.");
			invalidateQueriesEverywhere(qc, "bootstrap");
		},
		onError: (e) =>
			toast.error(mutationErrorMessage(e, "Bootstrap dispatch failed")),
	});

	return (
		<AccessGate permission={P.ORG_WRITE}>
			<div className="space-y-6">
				<PlatformOverviewCrumb section="Configuration" />

				<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between font-outfit">
					<div>
						<h1 className="text-2xl font-bold tracking-tight">
							System Controls
						</h1>
						<p className="text-sm text-muted-foreground mt-1">
							Manage platform-wide defaults, accounting templates, and global
							infrastructure bootstrap.
						</p>
					</div>
					<Button
						className="shadow-sm gap-2"
						disabled={saveM.isPending || settingsQ.isLoading}
						onClick={() => saveM.mutate()}
					>
						{saveM.isPending ? (
							<Loader2 className="h-4 w-4 animate-spin" />
						) : (
							<Save className="h-4 w-4" />
						)}
						Save Platform State
					</Button>
				</div>

				<div className="grid gap-6">
					<Card className="shadow-sm border-primary/10">
						<CardHeader>
							<div className="flex items-center gap-3">
								<div className="p-2 bg-primary/10 rounded-lg text-primary">
									<Rocket className="h-5 w-5" />
								</div>
								<div>
									<CardTitle>Environment Bootstrap</CardTitle>
									<CardDescription>
										Manually trigger the core provisioning sequence for a new
										organization.
									</CardDescription>
								</div>
							</div>
						</CardHeader>
						<CardContent className="flex flex-wrap items-end gap-4 bg-muted/20 pb-6 rounded-b-xl border-t">
							<div className="min-w-[280px] flex-1 space-y-2 mt-4">
								<Label
									htmlFor="bootstrap-org"
									className="text-xs font-bold uppercase opacity-60"
								>
									Target Organization
								</Label>
								<Select
									value={bootstrapOrgId || undefined}
									onValueChange={setBootstrapOrgId}
									disabled={organizationsQ.isLoading}
								>
									<SelectTrigger id="bootstrap-org" className="bg-background">
										<SelectValue
											placeholder={
												organizationsQ.isLoading
													? "Loading organizations..."
													: "Select organization..."
											}
										/>
									</SelectTrigger>
									<SelectContent>
										{(organizationsQ.data?.data || []).map((org) => {
											const raw = org._id ?? org.id;
											const id =
												typeof raw === "string"
													? raw.trim()
													: raw != null
														? String(raw).trim()
														: "";
											if (!id) return null;
											return (
												<SelectItem key={id} value={id}>
													{org.name}
													<span className="ml-1 text-[10px] opacity-60">
														({org.slug})
													</span>
												</SelectItem>
											);
										})}
									</SelectContent>
								</Select>
								{selectedBootstrapOrg ? (
									<p className="text-xs text-muted-foreground">
										Selected:{" "}
										<span className="font-medium">{selectedBootstrapOrg.name}</span>{" "}
										({selectedBootstrapOrg.slug})
									</p>
								) : null}
							</div>
							<Button
								variant="secondary"
								className="mt-4 font-outfit"
								disabled={!bootstrapOrgId.trim() || bootstrapM.isPending}
								onClick={() => bootstrapM.mutate()}
							>
								{bootstrapM.isPending
									? "Dispatching..."
									: "Initialize Sequence"}
							</Button>
						</CardContent>
					</Card>

					<div className="grid gap-6 md:grid-cols-2">
						<Card className="shadow-sm">
							<CardHeader>
								<CardTitle className="flex items-center gap-2 text-lg">
									<Globe className="h-5 w-5 text-primary" />
									Internationalization
								</CardTitle>
								<CardDescription>
									Configure supported ISO currencies and dashboard defaults.
								</CardDescription>
							</CardHeader>
							<CardContent className="space-y-4">
								{settingsQ.isLoading ? (
									<Skeleton className="h-40 w-full rounded-xl" />
								) : (
									<>
										<div className="space-y-2">
											<Label className="text-xs font-bold uppercase opacity-60">
												Supported Registry
											</Label>
											<Input
												value={currenciesText}
												onChange={(e) => setCurrenciesText(e.target.value)}
												placeholder="USD, EUR, GBP (comma separated)"
												className="bg-muted/30 font-mono text-sm"
											/>
										</div>
										<div className="space-y-2">
											<Label>Primary Default Currency</Label>
											<Select
												value={defaultCurrency}
												onValueChange={setDefaultCurrency}
											>
												<SelectTrigger className="bg-muted/30">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													{(parsedCurrencies.length
														? parsedCurrencies
														: ["USD"]
													).map((c) => (
														<SelectItem key={c} value={c}>
															{c}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>
									</>
								)}
							</CardContent>
						</Card>

						<Card className="shadow-sm">
							<CardHeader>
								<CardTitle className="flex items-center gap-2 text-lg">
									<Calculator className="h-5 w-5 text-primary" />
									Accounting Defaults
								</CardTitle>
								<CardDescription>
									Template values for tenant ledger and fiscal configuration.
								</CardDescription>
							</CardHeader>
							<CardContent className="grid gap-4 sm:grid-cols-2">
								{settingsQ.isLoading ? (
									<Skeleton className="h-40 w-full col-span-2 rounded-xl" />
								) : (
									<>
										<div className="space-y-2">
											<Label className="text-xs font-bold opacity-60">
												Reporting Currency
											</Label>
											<Input
												value={companyCurrency}
												onChange={(e) => setCompanyCurrency(e.target.value)}
												className="bg-muted/30 font-mono text-sm"
											/>
										</div>
										<div className="space-y-2">
											<Label className="text-xs font-bold opacity-60">
												Cost Strategy
											</Label>
											<Select value={costMethod} onValueChange={setCostMethod}>
												<SelectTrigger className="bg-muted/30">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="fifo">FIFO</SelectItem>
													<SelectItem value="weighted_average">
														Weighted Avg
													</SelectItem>
													<SelectItem value="standard">Standard</SelectItem>
												</SelectContent>
											</Select>
										</div>
										<div className="space-y-2">
											<Label className="text-xs font-bold opacity-60">
												Fiscal Start (Month)
											</Label>
											<Input
												type="number"
												min={1}
												max={12}
												value={fiscalMonth}
												onChange={(e) => setFiscalMonth(e.target.value)}
												className="bg-muted/30 font-mono text-sm"
											/>
										</div>
										<div className="space-y-2">
											<Label className="text-xs font-bold opacity-60">
												Inventory Trigger
											</Label>
											<Select
												value={stockTrigger}
												onValueChange={setStockTrigger}
											>
												<SelectTrigger className="bg-muted/30">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="kitchen_send">
														Kitchen Send
													</SelectItem>
													<SelectItem value="payment">On Payment</SelectItem>
													<SelectItem value="both">Synchronized</SelectItem>
												</SelectContent>
											</Select>
										</div>
									</>
								)}
							</CardContent>
						</Card>
					</div>

					<Card className="shadow-sm">
						<CardHeader className="flex flex-row items-center justify-between gap-4">
							<div className="flex items-center gap-3">
								<div className="p-2 bg-primary/10 rounded-lg text-primary">
									<Settings2 className="h-5 w-5" />
								</div>
								<div>
									<CardTitle>Platform Tax Templates</CardTitle>
									<CardDescription>
										Default tax configurations seeded to new tenant
										environments.
									</CardDescription>
								</div>
							</div>
							<Button
								variant="outline"
								size="sm"
								className="font-outfit"
								onClick={() =>
									setTaxRows([
										...taxRows,
										{ code: "", name: "", ratePercent: 0, kind: "sales" },
									])
								}
							>
								<Plus className="mr-2 h-4 w-4" /> Add Tax Identity
							</Button>
						</CardHeader>
						<CardContent>
							{settingsQ.isLoading ? (
								<Skeleton className="h-32 w-full rounded-xl" />
							) : (
								<div className="space-y-3">
									{taxRows.map((row, idx) => (
										<div
											key={idx}
											className="flex flex-wrap items-end gap-3 p-3 rounded-lg border bg-muted/10 group animate-in fade-in slide-in-from-top-1 transition-all"
										>
											<div className="flex-1 min-w-[120px] space-y-1">
												<Label className="text-[10px] font-bold uppercase opacity-50">
													Code
												</Label>
												<Input
													value={row.code}
													className="h-8 text-xs font-mono bg-background"
													onChange={(e) => {
														const next = [...taxRows];
														next[idx] = { ...row, code: e.target.value };
														setTaxRows(next);
													}}
												/>
											</div>
											<div className="flex-1 min-w-[200px] space-y-1">
												<Label className="text-[10px] font-bold uppercase opacity-50">
													Display Name
												</Label>
												<Input
													value={row.name}
													className="h-8 text-xs bg-background"
													onChange={(e) => {
														const next = [...taxRows];
														next[idx] = { ...row, name: e.target.value };
														setTaxRows(next);
													}}
												/>
											</div>
											<div className="w-24 space-y-1">
												<Label className="text-[10px] font-bold uppercase opacity-50">
													Rate %
												</Label>
												<Input
													type="number"
													value={row.ratePercent}
													className="h-8 text-xs bg-background"
													onChange={(e) => {
														const next = [...taxRows];
														next[idx] = {
															...row,
															ratePercent: Number(e.target.value),
														};
														setTaxRows(next);
													}}
												/>
											</div>
											<div className="w-32 space-y-1">
												<Label className="text-[10px] font-bold uppercase opacity-50">
													Kind
												</Label>
												<Select
													value={row.kind}
													onValueChange={(v: "sales" | "withholding") => {
														const next = [...taxRows];
														next[idx] = { ...row, kind: v };
														setTaxRows(next);
													}}
												>
													<SelectTrigger className="h-8 text-xs bg-background">
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="sales">Sales</SelectItem>
														<SelectItem value="withholding">
															Withholding
														</SelectItem>
													</SelectContent>
												</Select>
											</div>
											<Button
												variant="ghost"
												size="icon"
												className="h-8 w-8 text-muted-foreground hover:text-destructive transition-colors"
												onClick={() => {
													const next = [...taxRows];
													next.splice(idx, 1);
													setTaxRows(next);
												}}
											>
												<Trash2 className="h-4 w-4" />
											</Button>
										</div>
									))}
									{taxRows.length === 0 && (
										<div className="text-center py-8 border-2 border-dashed rounded-xl opacity-40">
											<p className="text-sm font-medium">
												No tax identities defined.
											</p>
										</div>
									)}
								</div>
							)}
						</CardContent>
					</Card>
				</div>
			</div>
		</AccessGate>
	);
}
