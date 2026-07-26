"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { Permissions } from "@/features/auth/permissions";
import { usePermissions } from "@/features/auth/hooks/use-permissions";

export default function UsersPage() {
  const { can } = usePermissions();
  const router = useRouter();

  useEffect(() => {
    if (!can(Permissions.ADM_MANAGE_USERS)) {
      router.replace("/forbidden");
    }
  }, [can, router]);

  if (!can(Permissions.ADM_MANAGE_USERS)) {
    return null;
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
      <p className="mt-2 text-muted-foreground">
        User Management UI arrives in a later phase. This page is gated by{" "}
        {Permissions.ADM_MANAGE_USERS}.
      </p>
    </main>
  );
}
