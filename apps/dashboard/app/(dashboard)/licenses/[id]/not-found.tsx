import { RouteNotFound } from "@/components/route-not-found";

export default function NotFound() {
  return (
    <RouteNotFound
      title="License not found"
      description="This license doesn't exist or has been removed."
      backHref="/licenses"
      backLabel="Back to licenses"
    />
  );
}
