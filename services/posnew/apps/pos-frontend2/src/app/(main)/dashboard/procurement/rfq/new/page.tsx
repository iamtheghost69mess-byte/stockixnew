import { redirect } from "next/navigation";

export default function NewRFQRedirectPage() {
  redirect("/dashboard/procurement/rfq");
}
