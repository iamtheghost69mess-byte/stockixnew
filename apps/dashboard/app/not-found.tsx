import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        The page you requested does not exist or was moved.
      </p>
      <Link href="/" className={buttonVariants({ variant: "default" })}>
        Back to dashboard
      </Link>
    </div>
  );
}
