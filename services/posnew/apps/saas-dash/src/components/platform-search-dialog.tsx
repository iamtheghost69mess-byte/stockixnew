"use client";

import { useQueries } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from "@/components/ui/command";
import { useDebounce } from "@/hooks/use-debounce";
import { apiKeyListResponseSchema } from "@/lib/api-schemas/api-keys";
import { organizationListResponseSchema } from "@/lib/api-schemas/organizations";
import { platformGlobalUserListResponseSchema } from "@/lib/api-schemas/users";
import { useAuthStore } from "@/lib/auth-store";
import { parseApiResponse } from "@/lib/parse-api-response";
import { hasPermission, P } from "@/lib/permissions";
import { platformJson } from "@/lib/platform-http";
import { platformNavEntries } from "@/navigation/platform-sidebar-items";

function readApiScopes(
	user: Record<string, unknown> | null | undefined,
): string[] {
	if (!user || typeof user !== "object") return [];
	const raw = user.apiScopes ?? user.scopes;
	if (!Array.isArray(raw)) return [];
	return raw.filter((x): x is string => typeof x === "string");
}

export function PlatformSearchDialog() {
	const router = useRouter();
	const user = useAuthStore((s) => s.user);
	const [open, setOpen] = React.useState(false);
	const [input, setInput] = React.useState("");
	const debounced = useDebounce(input, 320);

	const roles = user?.roles as string[] | undefined;
	const apiScopes = readApiScopes(
		user as Record<string, unknown> | null | undefined,
	);
	const canOrg = hasPermission(roles, P.ORG_READ, apiScopes);
	const canKeys = hasPermission(roles, P.ORG_READ, apiScopes);

	const navItems = React.useMemo(() => {
		return platformNavEntries.filter(
			(e) => !e.hidden && hasPermission(roles, e.perm, apiScopes),
		);
	}, [roles, apiScopes]);

	const q = debounced.trim();
	const runEntitySearch = open && q.length >= 2;

	const [orgsQ, usersQ, keysQ] = useQueries({
		queries: [
			{
				queryKey: ["platform-search", "organizations", q] as const,
				queryFn: async () => {
					const raw = await platformJson<unknown>(
						`/organizations?q=${encodeURIComponent(q)}&limit=5`,
					);
					const parsed = parseApiResponse(
						organizationListResponseSchema,
						raw,
						"organizations",
					);
					return (parsed.data ?? []) as Record<string, unknown>[];
				},
				enabled: runEntitySearch && canOrg,
				staleTime: 15_000,
			},
			{
				queryKey: ["platform-search", "users", q] as const,
				queryFn: async () => {
					const raw = await platformJson<unknown>(
						`/users/global?search=${encodeURIComponent(q)}&limit=5&skip=0`,
					);
					const parsed = parseApiResponse(
						platformGlobalUserListResponseSchema,
						raw,
						"global users",
					);
					return parsed.data?.users ?? [];
				},
				enabled: runEntitySearch && canOrg,
				staleTime: 15_000,
			},
			{
				queryKey: ["platform-search", "api-keys", q] as const,
				queryFn: async () => {
					const raw = await platformJson<unknown>("/auth/api-keys");
					const parsed = parseApiResponse(
						apiKeyListResponseSchema,
						raw,
						"api keys",
					);
					const rows = parsed.data ?? [];
					const needle = q.toLowerCase();
					return rows
						.filter((k) => {
							const label = (k.label ?? "").toLowerCase();
							const prefix = (k.keyPrefix ?? "").toLowerCase();
							return label.includes(needle) || prefix.includes(needle);
						})
						.slice(0, 5);
				},
				enabled: runEntitySearch && canKeys,
				staleTime: 15_000,
			},
		],
	});

	React.useEffect(() => {
		const down = (e: KeyboardEvent) => {
			if (e.key === "j" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				setOpen((v) => !v);
			}
		};
		document.addEventListener("keydown", down);
		return () => document.removeEventListener("keydown", down);
	}, []);

	React.useEffect(() => {
		if (!open) setInput("");
	}, [open]);

	const orgs = orgsQ.data ?? [];
	const users = usersQ.data ?? [];
	const keys = keysQ.data ?? [];
	const searching =
		runEntitySearch &&
		(orgsQ.isFetching || usersQ.isFetching || keysQ.isFetching);
	const hasEntityHits = orgs.length > 0 || users.length > 0 || keys.length > 0;

	return (
		<>
			<Button
				type="button"
				onClick={() => setOpen(true)}
				variant="link"
				className="px-0! font-normal text-muted-foreground hover:no-underline"
			>
				<Search data-icon="inline-start" />
				Search
				<kbd className="inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-medium text-[10px]">
					Ctrl+J
				</kbd>
			</Button>
			<CommandDialog
				open={open}
				onOpenChange={setOpen}
				title="Platform search"
				description="Find records or jump to a page"
			>
				<Command shouldFilter={false}>
					<CommandInput
						placeholder="Search organizations, users, API keys (min 2 chars), or pick a page below…"
						value={input}
						onValueChange={setInput}
					/>
					<CommandList>
						{searching ? (
							<CommandEmpty>Searching…</CommandEmpty>
						) : runEntitySearch && !hasEntityHits ? (
							<CommandEmpty>No matching records.</CommandEmpty>
						) : !runEntitySearch ? (
							<CommandEmpty>
								Type at least 2 characters to search data, or open a page.
							</CommandEmpty>
						) : null}

						{orgs.length > 0 && (
							<CommandGroup heading="Organizations">
								{orgs.map((o) => {
									const id = String((o as { _id?: string })._id ?? "");
									const name = String((o as { name?: string }).name ?? id);
									return (
										<CommandItem
											key={id}
											value={`org-${id}-${name}`}
											onSelect={() => {
												setOpen(false);
												router.push(`/organizations/${id}`);
											}}
										>
											<span className="truncate">{name}</span>
										</CommandItem>
									);
								})}
							</CommandGroup>
						)}

						{users.length > 0 && (
							<CommandGroup heading="Users">
								{users.map((u) => {
									const id = String((u as { _id?: string })._id ?? "");
									const email = String(
										(u as { email?: string | null }).email ?? id,
									);
									return (
										<CommandItem
											key={id}
											value={`user-${id}-${email}`}
											onSelect={() => {
												setOpen(false);
												router.push(`/users/${id}`);
											}}
										>
											<span className="truncate">{email}</span>
										</CommandItem>
									);
								})}
							</CommandGroup>
						)}

						{keys.length > 0 && (
							<CommandGroup heading="API keys">
								{keys.map((k) => {
									const id = String((k as { _id?: string })._id ?? "");
									const label = String(
										(k as { label?: string }).label ?? k.keyPrefix ?? id,
									);
									return (
										<CommandItem
											key={id}
											value={`key-${id}-${label}`}
											onSelect={() => {
												setOpen(false);
												router.push("/api-keys");
											}}
										>
											<span className="truncate">{label}</span>
										</CommandItem>
									);
								})}
							</CommandGroup>
						)}

						<CommandSeparator />

						<CommandGroup heading="Pages">
							{navItems.map((item) => {
								const Icon = item.icon;
								return (
									<CommandItem
										key={item.url}
										value={`nav-${item.title} ${item.url}`}
										onSelect={() => {
											setOpen(false);
											router.push(item.url);
										}}
									>
										{Icon ? <Icon /> : null}
										<span>{item.title}</span>
									</CommandItem>
								);
							})}
						</CommandGroup>
					</CommandList>
				</Command>
			</CommandDialog>
		</>
	);
}
