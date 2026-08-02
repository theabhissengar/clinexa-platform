"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { listRoles } from "@/features/users/api/users-api";
import type { Role } from "@/features/users/types";

export function RolesListPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void listRoles()
      .then(setRoles)
      .catch(() => setError("Unable to load roles."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Roles</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Fixed platform role set. Edit permission grants per role.
        </p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-180 text-left text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Code</th>
                <th className="px-3 py-2 font-medium">Permissions</th>
                <th className="px-3 py-2 font-medium">Users</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr
                  key={role.id}
                  className="border-t border-border hover:bg-muted/20"
                >
                  <td className="px-3 py-3">
                    <Link
                      href={`/guardian/roles/${role.id}/edit`}
                      className="font-semibold text-primary hover:underline"
                    >
                      {role.name}
                    </Link>
                    {role.description ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {role.description}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 font-mono text-xs text-muted-foreground">
                    {role.code}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">
                    {role.permissionCodes.length}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">
                    {role.assignedUserCount}
                  </td>
                </tr>
              ))}
              {!roles.length ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    No roles found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
