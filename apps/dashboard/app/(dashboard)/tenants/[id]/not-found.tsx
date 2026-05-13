import { RouteNotFound } from "@/components/route-not-found";

export default function NotFound() {
  return (
    <RouteNotFound
      title="Tenant not found"
      description="This tenant doesn't exist or you don't have access."
      backHref="/tenants"
      backLabel="Back to tenants"
    />
  );
}
