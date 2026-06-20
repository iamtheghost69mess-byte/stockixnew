import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Button } from "@repo/ui/button";

interface RouteNotFoundProps {
  title?: string;
  description?: string;
  backHref?: string;
  backLabel?: string;
}

export function RouteNotFound({
  title = "Page not found",
  description = "The page you're looking for doesn't exist or has been moved.",
  backHref = "/",
  backLabel = "Back to dashboard",
}: RouteNotFoundProps) {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 p-6 text-center">
      <FileQuestion className="h-12 w-12 text-muted-foreground" />
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Button nativeButton={false} render={<Link href={backHref} />} variant="outline" size="sm">
        {backLabel}
      </Button>
    </div>
  );
}
