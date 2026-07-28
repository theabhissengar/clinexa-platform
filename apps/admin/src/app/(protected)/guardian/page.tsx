"use client";

import { LayoutDashboard } from "lucide-react";

import { ModuleComingSoon } from "@/components/layout/module-coming-soon";

/**
 * Guardian administrative dashboard placeholder.
 */
export default function GuardianDashboardPage() {
  return (
    <ModuleComingSoon
      title="Guardian Dashboard"
      description="Administrative health, publish state, governance shortcuts, and platform signals will land here. This page is a shell placeholder only."
      icon={LayoutDashboard}
    />
  );
}
