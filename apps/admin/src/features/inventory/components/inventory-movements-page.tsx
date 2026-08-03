"use client";

import { useEffect, useState } from "react";

import { listMovements } from "../api/inventory-api";
import type { StockMovement } from "../types";
import { InventorySubnav } from "./inventory-subnav";

export function InventoryMovementsPage() {
  const [items, setItems] = useState<StockMovement[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void listMovements({ take: 100 })
      .then((res) => setItems(res.items))
      .catch(() => setError("Unable to load movements."));
  }, []);

  return (
    <main className="px-6 py-8">
      <h1 className="text-2xl font-semibold">Movements</h1>
      <p className="text-sm text-muted-foreground">
        Append-only ledger — source of truth for stock history.
      </p>
      <InventorySubnav />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <ul className="space-y-2">
        {items.map((m) => (
          <li key={m.id} className="rounded-lg border px-4 py-3 text-sm">
            <div className="font-mono text-xs">{m.movementType}</div>
            <div>
              Δ {m.quantityDelta} · variant {m.productVariantId.slice(0, 8)}…
            </div>
            <div className="text-muted-foreground">
              {m.reason ?? "—"} · {new Date(m.createdAt).toLocaleString()}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
