"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePermissions } from "@/features/auth/hooks/use-permissions";
import { Permissions } from "@/features/auth/permissions";

import { getPolicies, purgeZeroBalances, updatePolicies } from "../api/inventory-api";
import type { InventoryPolicy } from "../types";
import { InventorySubnav } from "./inventory-subnav";

export function InventoryPoliciesPage() {
  const { can } = usePermissions();
  const canManage = can(Permissions.INV_MANAGE_WAREHOUSE);
  const canPurge = can(Permissions.INV_DESTRUCTIVE);
  const [policy, setPolicy] = useState<InventoryPolicy | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getPolicies()
      .then(setPolicy)
      .catch(() => setError("Unable to load policies."));
  }, []);

  if (!policy) {
    return (
      <main className="px-6 py-8">
        <h1 className="text-2xl font-semibold">Policies</h1>
        <InventorySubnav />
        {error ? <p className="text-sm text-destructive">{error}</p> : <p>Loading…</p>}
      </main>
    );
  }

  return (
    <main className="px-6 py-8">
      <h1 className="text-2xl font-semibold">Inventory policies</h1>
      <p className="text-sm text-muted-foreground">
        Platform-wide administrative configuration (Guardian only).
      </p>
      <InventorySubnav />
      <section className="max-w-md space-y-3 rounded-lg border p-4">
        <label className="block text-sm">
          Oversell mode
          <select
            className="mt-1 w-full rounded-md border px-2 py-2"
            disabled={!canManage}
            value={policy.oversellMode}
            onChange={(e) =>
              setPolicy({
                ...policy,
                oversellMode: e.target.value as "PREVENT" | "ALLOW",
              })
            }
          >
            <option value="PREVENT">PREVENT</option>
            <option value="ALLOW">ALLOW</option>
          </select>
        </label>
        <label className="block text-sm">
          Reservation timeout (minutes)
          <Input
            type="number"
            disabled={!canManage}
            value={policy.reservationTimeoutMinutes}
            onChange={(e) =>
              setPolicy({
                ...policy,
                reservationTimeoutMinutes: Number(e.target.value),
              })
            }
          />
        </label>
        <label className="block text-sm">
          Low-stock threshold
          <Input
            type="number"
            disabled={!canManage}
            value={policy.lowStockThreshold}
            onChange={(e) =>
              setPolicy({
                ...policy,
                lowStockThreshold: Number(e.target.value),
              })
            }
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            disabled={!canManage}
            checked={policy.allowNegativeStock}
            onChange={(e) =>
              setPolicy({
                ...policy,
                allowNegativeStock: e.target.checked,
              })
            }
          />
          Allow negative stock
        </label>
        {canManage ? (
          <Button
            type="button"
            onClick={() =>
              void updatePolicies({
                oversellMode: policy.oversellMode,
                reservationTimeoutMinutes: policy.reservationTimeoutMinutes,
                lowStockThreshold: policy.lowStockThreshold,
                allowNegativeStock: policy.allowNegativeStock,
              })
                .then((p) => {
                  setPolicy(p);
                  setMessage("Policies saved.");
                })
                .catch(() => setError("Save failed."))
            }
          >
            Save
          </Button>
        ) : null}
        {message ? <p className="text-sm text-green-700">{message}</p> : null}
      </section>

      {canPurge ? (
        <section className="mt-8 max-w-md space-y-2 rounded-lg border border-destructive/40 p-4">
          <h2 className="font-medium text-destructive">Class D cleanup</h2>
          <p className="text-xs text-muted-foreground">
            Bounded purge of zero on-hand / zero reserved balance rows.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              void purgeZeroBalances(true).then((r) =>
                setMessage(`Dry run: would delete ${JSON.stringify(r)}`),
              )
            }
          >
            Dry run
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() =>
              void purgeZeroBalances(false).then((r) =>
                setMessage(`Purged: ${JSON.stringify(r)}`),
              )
            }
          >
            Purge zero balances
          </Button>
        </section>
      ) : null}
    </main>
  );
}
