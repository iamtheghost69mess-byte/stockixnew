"use client";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@repo/ui/breadcrumb";

import { Users } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { OwnersPageContent } from "./_components/owners-page-content";

export default function OwnersPage() {
  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Team & access</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <PageHeader
        icon={Users}
        title="Team & access"
        description="Platform administrators who can have tenants assigned to them."
      />

      <OwnersPageContent />
    </div>
  );
}
