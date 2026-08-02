"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  getRole,
  listPermissions,
  setRolePermissions,
} from "@/features/users/api/users-api";
import type { Permission, Role } from "@/features/users/types";

export function RoleEditorPage() {
  const params = useParams<{ id: string }>();
  const roleId = params.id;

  const [role, setRole] = useState<Role | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getRole(roleId), listPermissions()])
      .then(([roleData, permissionData]) => {
        setRole(roleData);
        setPermissions(permissionData);
        setSelectedCodes(new Set(roleData.permissionCodes));
      })
      .catch(() => setError("Unable to load role."))
      .finally(() => setLoading(false));
  }, [roleId]);

  const grouped = useMemo(() => {
    const map = new Map<string, Permission[]>();
    for (const permission of permissions) {
      const list = map.get(permission.module) ?? [];
      list.push(permission);
      map.set(permission.module, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [permissions]);

  function toggle(code: string) {
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function toggleModule(modulePermissions: Permission[], checked: boolean) {
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      for (const permission of modulePermissions) {
        if (checked) next.add(permission.code);
        else next.delete(permission.code);
      }
      return next;
    });
  }

  async function onSave() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await setRolePermissions(roleId, [...selectedCodes]);
      setRole(updated);
      setSelectedCodes(new Set(updated.permissionCodes));
      setMessage("Permissions updated.");
    } catch {
      setError("Unable to update permissions.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="px-6 py-10 text-sm text-muted-foreground">
        Loading role…
      </main>
    );
  }

  if (!role) {
    return (
      <main className="px-6 py-10 text-sm text-destructive">
        {error ?? "Role not found."}
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-4 py-8 md:px-6">
      <div>
        <Link
          href="/guardian/roles"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← All roles
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          {role.name}
        </h1>
        <p className="mt-1 font-mono text-xs text-muted-foreground">
          {role.code}
        </p>
        {role.description ? (
          <p className="mt-1 text-sm text-muted-foreground">
            {role.description}
          </p>
        ) : null}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {message ? (
        <p className="text-sm text-emerald-600">{message}</p>
      ) : null}

      <div className="flex flex-col gap-3">
        {grouped.map(([moduleName, modulePermissions]) => {
          const allChecked = modulePermissions.every((p) =>
            selectedCodes.has(p.code),
          );
          return (
            <div
              key={moduleName}
              className="overflow-hidden rounded-md border border-border bg-card"
            >
              <div className="flex items-center justify-between border-b border-border bg-muted/30 px-3 py-2 text-sm font-medium">
                <span>{moduleName}</span>
                <label className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={(e) =>
                      toggleModule(modulePermissions, e.target.checked)
                    }
                  />
                  Select all
                </label>
              </div>
              <div className="grid gap-1.5 p-3 text-sm sm:grid-cols-2">
                {modulePermissions.map((permission) => (
                  <label
                    key={permission.code}
                    className="flex items-start gap-2"
                    title={permission.description ?? undefined}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={selectedCodes.has(permission.code)}
                      onChange={() => toggle(permission.code)}
                    />
                    <span>
                      {permission.name}
                      <span className="ml-1 font-mono text-xs text-muted-foreground">
                        {permission.code}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div>
        <Button disabled={saving} onClick={() => void onSave()}>
          {saving ? "Saving…" : "Save permissions"}
        </Button>
      </div>
    </main>
  );
}
