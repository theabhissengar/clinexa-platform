"use client";

import { LayoutDashboard } from "lucide-react";

import { ModuleComingSoon } from "@/components/layout/module-coming-soon";

/**
 * CRM operational dashboard placeholder.
 */
export default function CrmDashboardPage() {
  return (
    <ModuleComingSoon
      title="CRM Dashboard"
      description="Operational KPIs, clinical queues, and day-to-day workspace widgets will land here. This page is a shell placeholder only."
      icon={LayoutDashboard}
    />
  );
}
