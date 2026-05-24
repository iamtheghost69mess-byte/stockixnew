import type { Metadata } from "next";

import { RbacSettings } from "./_components/rbac-settings";

export const metadata: Metadata = {
  title: "Roles & RBAC",
};

export default function Page() {
  return <RbacSettings />;
}
