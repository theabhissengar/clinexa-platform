"use client";

import { useAuth } from "@/providers/auth-provider";
import { usePermissions } from "@/features/auth/hooks/use-permissions";

export default function HomePage() {
  const { user } = useAuth();
  const { roles, permissions } = usePermissions();

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-10">
      <p className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
        Clinexa Platform
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
        Internal Management
      </h1>
      <p className="mt-3 max-w-2xl text-base text-muted-foreground">
        Signed in as {user?.email}. RBAC foundation is active — navigation and
        pages respect server-resolved permissions.
      </p>
      <div className="mt-8 grid gap-4 text-sm text-muted-foreground sm:grid-cols-2">
        <div>
          <p className="font-medium text-foreground">Roles</p>
          <p className="mt-1">{roles.length > 0 ? roles.join(", ") : "None"}</p>
        </div>
        <div>
          <p className="font-medium text-foreground">Permissions</p>
          <p className="mt-1">
            {permissions.length} granted (including CRM shell when staff)
          </p>
        </div>
      </div>
    </main>
  );
}
