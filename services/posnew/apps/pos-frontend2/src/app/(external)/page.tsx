import { redirect } from "next/navigation";

type ExternalRootSearchParams = { org?: string | string[] };

/**
 * Fallback when proxy is not applied. Prefer `src/proxy.ts` for `/` -> `/login`
 * so we never run a no-render `redirect()` page named in a way that breaks User Timing.
 */
export default async function ExternalRootPage({ searchParams }: { searchParams: Promise<ExternalRootSearchParams> }) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  const org = sp.org;
  if (typeof org === "string" && org.trim()) qs.set("org", org.trim());
  const q = qs.toString();
  redirect(q ? `/login?${q}` : "/login");
}
