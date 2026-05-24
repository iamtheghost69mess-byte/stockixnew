import { redirect } from "next/navigation";

/** Legacy shadcn demo route — authenticated shell lives at `/`. */
export default function LegacyDashboardRedirect() {
  redirect("/");
}
