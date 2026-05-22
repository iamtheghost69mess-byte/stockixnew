import { Skeleton } from "@/components/ui/skeleton";

export default function PlatformLoading() {
	return (
		<div className="space-y-6 p-6">
			<Skeleton className="h-9 w-48" />
			<div className="grid gap-4 md:grid-cols-3">
				<Skeleton className="h-28 rounded-xl" />
				<Skeleton className="h-28 rounded-xl" />
				<Skeleton className="h-28 rounded-xl" />
			</div>
			<Skeleton className="h-64 w-full rounded-xl" />
		</div>
	);
}
