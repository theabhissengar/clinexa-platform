"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePermissions } from "@/features/auth/hooks/use-permissions";
import { Permissions } from "@/features/auth/permissions";

import {
  adjustStock,
  getBalance,
  listMovements,
} from "../api/inventory-api";
import type { InventoryBalanceRow, StockMovement } from "../types";
import { InventorySubnav } from "./inventory-subnav";

export function InventoryStockDetailPage() {
  const params = useParams<{ variantId: string }>();
  const variantId = params.variantId;
  const { can } = usePermissions();
  const canAdjust = can(Permissions.INV_MANAGE_STOCK);

  const [balance, setBalance] = useState<InventoryBalanceRow | null>(null);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [delta, setDelta] = useState("0");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const [b, m] = await Promise.all([
          getBalance(variantId),
          listMovements({ productVariantId: variantId, take: 30 }),
        ]);
        if (cancelled) return;
        setBalance(b);
        setMovements(m.items);
        setError(null);
      } catch {
        if (!cancelled) setError("Unable to load stock detail.");
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [variantId]);

  async function reload() {
    const [b, m] = await Promise.all([
      getBalance(variantId),
      listMovements({ productVariantId: variantId, take: 30 }),
    ]);
    setBalance(b);
    setMovements(m.items);
  }
  async function onAdjust() {
    setMessage(null);
    try {
      await adjustStock({
        productVariantId: variantId,
        quantityDelta: Number(delta),
        reason,
      });
      setMessage("Adjustment recorded (ledger movement appended).");
      setReason("");
      await reload();
    } catch {
      setError("Adjustment failed.");
    }
  }

  return (
    <main className="px-6 py-8">
      <h1 className="text-2xl font-semibold">Stock detail</h1>
      <p className="font-mono text-xs text-muted-foreground">{variantId}</p>
      <InventorySubnav />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {balance ? (
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">On hand</div>
            <div className="text-xl font-semibold">{balance.quantityOnHand}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">Reserved</div>
            <div className="text-xl font-semibold">
              {balance.quantityReserved}
            </div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">Available</div>
            <div className="text-xl font-semibold">{balance.available}</div>
          </div>
        </div>
      ) : null}

      {canAdjust ? (
        <section className="mb-8 max-w-md space-y-2 rounded-lg border p-4">
          <h2 className="font-medium">Adjust stock</h2>
          <Input
            type="number"
            value={delta}
            onChange={(e) => setDelta(e.target.value)}
            placeholder="Signed delta"
          />
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (required)"
          />
          <Button type="button" onClick={() => void onAdjust()} disabled={!reason}>
            Apply adjustment
          </Button>
          {message ? <p className="text-sm text-green-700">{message}</p> : null}
        </section>
      ) : null}

      <h2 className="mb-2 font-medium">Recent movements</h2>
      <ul className="space-y-1 text-sm">
        {movements.map((m) => (
          <li key={m.id} className="rounded border px-3 py-2">
            <span className="font-mono text-xs">{m.movementType}</span>{" "}
            {m.quantityDelta > 0 ? "+" : ""}
            {m.quantityDelta}
            {m.reason ? ` — ${m.reason}` : ""}{" "}
            <span className="text-muted-foreground">
              {new Date(m.createdAt).toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
