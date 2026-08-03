"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePermissions } from "@/features/auth/hooks/use-permissions";
import { Permissions } from "@/features/auth/permissions";

import { receiveStock } from "../api/inventory-api";
import { InventorySubnav } from "./inventory-subnav";

export function InventoryReceivingPage() {
  const { can } = usePermissions();
  const canReceive = can(Permissions.INV_MANAGE_STOCK);
  const [variantId, setVariantId] = useState("");
  const [qty, setQty] = useState("1");
  const [reason, setReason] = useState("Receiving");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!canReceive) {
    return (
      <main className="px-6 py-8">
        <h1 className="text-2xl font-semibold">Receiving</h1>
        <InventorySubnav />
        <p className="text-sm text-muted-foreground">
          You need inventory adjust/receive permission.
        </p>
      </main>
    );
  }

  return (
    <main className="px-6 py-8">
      <h1 className="text-2xl font-semibold">Receiving</h1>
      <InventorySubnav />
      <section className="max-w-md space-y-2 rounded-lg border p-4">
        <Input
          placeholder="Product variant UUID"
          value={variantId}
          onChange={(e) => setVariantId(e.target.value)}
        />
        <Input
          type="number"
          min={1}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
        />
        <Input
          placeholder="Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <Button
          type="button"
          onClick={() => {
            setError(null);
            void receiveStock({
              productVariantId: variantId,
              quantity: Number(qty),
              reason,
            })
              .then(() => setMessage("Received — movement appended."))
              .catch(() => setError("Receive failed."));
          }}
        >
          Receive
        </Button>
        {message ? <p className="text-sm text-green-700">{message}</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </section>
    </main>
  );
}
