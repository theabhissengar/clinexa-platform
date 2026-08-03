"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getInventoryDashboard } from "../api/inventory-api";
import type { InventoryDashboard } from "../types";
import { InventorySubnav } from "./inventory-subnav";

export function InventoryDashboardPage() {
  const [data, setData] = useState<InventoryDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getInventoryDashboard()
      .then(setData)
      .catch(() => setError("Unable to load inventory dashboard."));
  }, []);

  return (
    <main className="px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Ledger-first stock administration (Guardian only).
      </p>
      <InventorySubnav />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {!data && !error ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : null}
      {data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "SKUs with stock", value: data.skuCount },
            { label: "Low stock", value: data.lowStockCount },
            { label: "On hand (units)", value: data.onHandTotal },
            { label: "Reserved (units)", value: data.reservedTotal },
            { label: "Pending reservations", value: data.pendingReservations },
            { label: "Default warehouse", value: data.warehouseCode },
            { label: "Oversell mode", value: data.oversellMode },
            { label: "Low-stock threshold", value: data.lowStockThreshold },
          ].map((card) => (
            <div
              key={card.label}
              className="rounded-lg border border-border bg-card p-4"
            >
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                {card.label}
              </div>
              <div className="mt-2 text-2xl font-semibold">{card.value}</div>
            </div>
          ))}
        </div>
      ) : null}
      <div className="mt-8 flex gap-3 text-sm">
        <Link className="text-primary underline" href="/guardian/inventory/stock">
          View stock
        </Link>
        <Link
          className="text-primary underline"
          href="/guardian/inventory/receiving"
        >
          Receive stock
        </Link>
      </div>
    </main>
  );
}
