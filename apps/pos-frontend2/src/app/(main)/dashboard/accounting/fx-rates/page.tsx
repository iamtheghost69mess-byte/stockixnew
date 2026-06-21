import { redirect } from "next/navigation";

/**
 * Legacy URL: FX rates now live under Tax & treasury → Exchange rates.
 */
export default function AccountingFxRatesRedirectPage() {
  redirect("/dashboard/tax?tab=fx");
}
