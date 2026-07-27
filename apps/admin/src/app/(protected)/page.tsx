"use client";

import { LayoutDashboard } from "lucide-react";

import { ModuleComingSoon } from "@/components/layout/module-coming-soon";

/**
 * Dashboard placeholder — future widgets/analytics must not change the shell.
 */
export default function DashboardPage() {
  return (
    <ModuleComingSoon
      title="Dashboard"
      description="Dashboard widgets, analytics, and KPIs will be delivered in a future phase. This page is a shell placeholder only."
      icon={LayoutDashboard}
    />
  );
}
