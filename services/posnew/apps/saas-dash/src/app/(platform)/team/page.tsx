"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	Building,
	Mail,
	PlusCircle,
	ShieldCheck,
	UserPlus,
} from "lucide-react";
import { useState } from "react";

import { useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";
import { ResourcePage } from "@/components/resource-page";
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
import {
	Field,
	FieldContent,
	FieldError,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { organizationListResponseSchema } from "@/lib/api-schemas/organizations";
import { parseApiResponse } from "@/lib/parse-api-response";
import { platformJson } from "@/lib/platform-http";
import { ResourceRegistry } from "@/lib/resource-config";

const inviteSchema = z.object({
	email: z.string().email("Invalid email address"),
	roleHint: z.string().min(1, "Please select a role"),
	organizationId: z.string().min(1, "Please select an organization"),
});

type InviteFormValues = z.infer<typeof inviteSchema>;

/**
 * Professional Dialog for sending platform invitations.
 * Consolidates complex form logic into a reusable modal.
 */
function SendInvitationDialog() {
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);

	const {
		register,
		handleSubmit,
		setValue,
		watch,
		reset,
		formState: { errors, isValid },
	} = useForm<InviteFormValues>({
		resolver: zodResolver(inviteSchema),
		defaultValues: {
			roleHint: "waiter",
			organizationId: "",
		},
	});

	const selectedRole = watch("roleHint");
	const selectedOrg = watch("organizationId");

	const orgsQ = useQuery({
		queryKey: ["platform", "orgs", "simple-list"],
		queryFn: async () => {
			const raw = await platformJson<unknown>("/organizations?limit=100");
			const res = parseApiResponse(
				organizationListResponseSchema,
				raw,
				"organizations list (simple)",
			);
			return res.data || [];
		},
	});

	const inviteMutation = useMutation({
		mutationFn: async (values: InviteFormValues) => {
			return platformJson("/invitations", {
				method: "POST",
				body: JSON.stringify(values),
			});
		},
		onSuccess: () => {
			toast.success("Invitation dispatched successfully.");
			queryClient.invalidateQueries({
				queryKey: [ResourceRegistry.invitations.id],
			});
			reset();
			setOpen(false);
		},
		onError: (err: unknown) => {
			const msg =
				err instanceof Error ? err.message : "Failed to trigger invitation.";
			toast.error(msg);
		},
	});

	const roles = [
		{
			value: "admin",
			label: "Administrator",
			description: "Full access to organization settings",
		},
		{
			value: "manager",
			label: "Manager",
			description: "Manage locations and reports",
		},
		{
			value: "waiter",
			label: "Waiter",
			description: "Limited access to orders and tables",
		},
		{
			value: "operator",
			label: "Platform Operator",
			description: "System-level maintenance access",
		},
	];

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button className="gap-2 font-outfit shadow-sm">
					<PlusCircle className="h-4 w-4" />
					Send Invitation
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<UserPlus className="h-5 w-5 text-primary" />
						Invite Member
					</DialogTitle>
					<DialogDescription>
						Recipients will receive a secure registration link via email.
					</DialogDescription>
				</DialogHeader>

				<form
					onSubmit={handleSubmit((d) => inviteMutation.mutate(d))}
					className="space-y-4 py-4"
				>
					<Field>
						<FieldLabel className="text-xs font-semibold uppercase opacity-70">
							<Mail className="h-3 w-3" />
							Recipient Email
						</FieldLabel>
						<FieldContent>
							<Input
								placeholder="name@organization.com"
								{...register("email")}
								autoComplete="off"
							/>
						</FieldContent>
						{errors.email && <FieldError>{errors.email.message}</FieldError>}
					</Field>

					<Field>
						<FieldLabel className="text-xs font-semibold uppercase opacity-70">
							<Building className="h-3 w-3" />
							Target Organization
						</FieldLabel>
						<FieldContent>
							{orgsQ.isLoading ? (
								<Skeleton className="h-10 w-full" />
							) : (
								<Select
									value={selectedOrg}
									onValueChange={(val: string) =>
										setValue("organizationId", val, { shouldValidate: true })
									}
								>
									<SelectTrigger>
										<SelectValue placeholder="Select organization..." />
									</SelectTrigger>
									<SelectContent>
										{orgsQ.data?.map((org) => (
											<SelectItem key={org._id} value={org._id}>
												{org.name}{" "}
												<span className="text-[10px] opacity-40 ml-1">
													({org.slug})
												</span>
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							)}
						</FieldContent>
						{errors.organizationId && (
							<FieldError>{errors.organizationId.message}</FieldError>
						)}
					</Field>

					<Field>
						<FieldLabel className="text-xs font-semibold uppercase opacity-70">
							<ShieldCheck className="h-3 w-3" />
							Assigned Role
						</FieldLabel>
						<FieldContent>
							<Select
								value={selectedRole}
								onValueChange={(val: string) =>
									setValue("roleHint", val, { shouldValidate: true })
								}
							>
								<SelectTrigger>
									<SelectValue placeholder="Select role" />
								</SelectTrigger>
								<SelectContent>
									{roles.map((role) => (
										<SelectItem key={role.value} value={role.value}>
											<div className="flex flex-col text-left">
												<span className="text-sm font-medium">
													{role.label}
												</span>
												<span className="text-[10px] text-muted-foreground leading-tight">
													{role.description}
												</span>
											</div>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</FieldContent>
						{errors.roleHint && (
							<FieldError>{errors.roleHint.message}</FieldError>
						)}
					</Field>

					<DialogFooter className="pt-4 mt-4 border-t">
						<Button
							type="submit"
							className="w-full"
							disabled={inviteMutation.isPending || !isValid}
						>
							{inviteMutation.isPending ? "Dispatched..." : "Send Invitation"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

/**
 * Modernized Team Management Module.
 * Consolidates invitation tracking and creation into a unified, high-performance view.
 */
export default function TeamPage() {
	return (
		<ResourcePage
			resource={ResourceRegistry.invitations}
			extraActions={<SendInvitationDialog />}
		/>
	);
}
