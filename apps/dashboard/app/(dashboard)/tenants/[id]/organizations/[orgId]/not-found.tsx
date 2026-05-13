import { RouteNotFound } from "@/components/route-not-found";

export default function NotFound() {
  return (
    <RouteNotFound
      title="Organization not found"
      description="This organization doesn't exist or has been removed."
      backHref=".."
      backLabel="Back to tenant"
    />
  );
}
