"use client";

import { useQuery } from "@tanstack/react-query";
import { RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { organizationListResponseSchema } from "@/lib/api-schemas/organizations";
import { parseApiResponse } from "@/lib/parse-api-response";
import { platformJson } from "@/lib/platform-http";
import { qk } from "@/lib/query-keys";

interface OrganizationSelectorProps {
	value?: string;
	onChange: (value: string | undefined) => void;
}

export function OrganizationSelector({
	value,
	onChange,
}: OrganizationSelectorProps) {
	const { data, isLoading, isError, refetch } = useQuery({
		queryKey: qk.organizationsList,
		queryFn: async () => {
			const raw = await platformJson<unknown>("/organizations?limit=100");
			return parseApiResponse(
				organizationListResponseSchema,
				raw,
				"organizations selector",
			);
		},
		staleTime: 10 * 60 * 1000,
	});

	if (isError) {
		return (
			<div className="flex items-center gap-2">
				<Select disabled>
					<SelectTrigger className="w-[200px]">
						<SelectValue placeholder="Failed to load" />
					</SelectTrigger>
				</Select>
				<Button
					variant="ghost"
					size="icon"
					onClick={() => refetch()}
					title="Retry"
				>
					<RefreshCcw className="h-4 w-4" />
				</Button>
			</div>
		);
	}

	return (
		<Select
			value={value || "all"}
			onValueChange={(val) => onChange(val === "all" ? undefined : val)}
			disabled={isLoading}
		>
			<SelectTrigger className="w-[200px]">
				<SelectValue
					placeholder={isLoading ? "Loading..." : "Select organization"}
				/>
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="all">All orgs (Platform aggregate)</SelectItem>
				{data?.data?.flatMap((org) => {
					const raw = org._id ?? org.id;
					const id =
						typeof raw === "string"
							? raw.trim()
							: raw != null
								? String(raw).trim()
								: "";
					if (!id) return [];
					return (
						<SelectItem key={id} value={id}>
							{org.name}
						</SelectItem>
					);
				})}
			</SelectContent>
		</Select>
	);
}
