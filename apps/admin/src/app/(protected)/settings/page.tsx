"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { Permissions } from "@/features/auth/permissions";
import { usePermissions } from "@/features/auth/hooks/use-permissions";

export default function SettingsPage() {
  const { can } = usePermissions();
  const router = useRouter();

  useEffect(() => {
    if (!can(Permissions.SET_MANAGE)) {
      router.replace("/forbidden");
    }
  }, [can, router]);

  if (!can(Permissions.SET_MANAGE)) {
    return null;
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-2 text-muted-foreground">
        Platform settings UI arrives in a later phase. This page is gated by{" "}
        {Permissions.SET_MANAGE}.
      </p>
    </main>
  );
}
