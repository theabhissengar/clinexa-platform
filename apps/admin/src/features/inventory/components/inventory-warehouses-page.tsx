"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePermissions } from "@/features/auth/hooks/use-permissions";
import { Permissions } from "@/features/auth/permissions";

import {
  createWarehouse,
  listWarehouses,
  updateWarehouse,
} from "../api/inventory-api";
import type { Warehouse } from "../types";
import { InventorySubnav } from "./inventory-subnav";

export function InventoryWarehousesPage() {
  const { can } = usePermissions();
  const canManage = can(Permissions.INV_MANAGE_WAREHOUSE);
  const [items, setItems] = useState<Warehouse[]>([]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const rows = await listWarehouses();
        if (cancelled) return;
        setItems(rows);
        setError(null);
      } catch {
        if (!cancelled) setError("Unable to load warehouses.");
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  async function reload() {
    setItems(await listWarehouses());
  }
  return (
    <main className="px-6 py-8">
      <h1 className="text-2xl font-semibold">Warehouses</h1>
      <p className="text-sm text-muted-foreground">
        V1 uses a single default warehouse; schema is multi-warehouse ready.
      </p>
      <InventorySubnav />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <ul className="mb-6 space-y-2">
        {items.map((w) => (
          <li
            key={w.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3"
          >
            <div>
              <div className="font-medium">
                {w.name}{" "}
                {w.isDefault ? (
                  <span className="text-xs text-muted-foreground">(default)</span>
                ) : null}
              </div>
              <div className="font-mono text-xs text-muted-foreground">
                {w.code} · {w.status}
              </div>
            </div>
            {canManage && !w.isDefault ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  void updateWarehouse(w.id, {
                    status: w.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
                  }).then(reload)
                }
              >
                {w.status === "ACTIVE" ? "Deactivate" : "Activate"}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {canManage ? (
        <section className="max-w-md space-y-2 rounded-lg border p-4">
          <h2 className="font-medium">Add warehouse</h2>
          <Input
            placeholder="Code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <Input
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button
            type="button"
            onClick={() =>
              void createWarehouse({ code, name })
                .then(() => {
                  setCode("");
                  setName("");
                  return reload();
                })
                .catch(() => setError("Create failed."))
            }
          >
            Create
          </Button>
        </section>
      ) : null}
    </main>
  );
}
