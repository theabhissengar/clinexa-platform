"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { listBalances } from "../api/inventory-api";
import type { InventoryBalanceRow } from "../types";
import { InventorySubnav } from "./inventory-subnav";

export function InventoryStockListPage() {
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [items, setItems] = useState<InventoryBalanceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void listBalances({ q: q || undefined, lowStockOnly: lowOnly, take: 100 })
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
        setError(null);
      })
      .catch(() => setError("Unable to load stock."));
  }, [q, lowOnly]);

  return (
    <main className="px-6 py-8">
      <h1 className="text-2xl font-semibold">Stock</h1>
      <InventorySubnav />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          className="max-w-xs"
          placeholder="Search SKU or product"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <Button type="button" onClick={() => setQ(draft.trim())}>
          Search
        </Button>
        <Button
          type="button"
          variant={lowOnly ? "default" : "outline"}
          onClick={() => setLowOnly((v) => !v)}
        >
          Low stock only
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <p className="mb-2 text-xs text-muted-foreground">{total} balances</p>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="px-3 py-2">SKU</th>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2">On hand</th>
              <th className="px-3 py-2">Reserved</th>
              <th className="px-3 py-2">Available</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.productVariantId} className="border-b last:border-0">
                <td className="px-3 py-2 font-mono text-xs">{row.sku}</td>
                <td className="px-3 py-2">{row.productName}</td>
                <td className="px-3 py-2">{row.quantityOnHand}</td>
                <td className="px-3 py-2">{row.quantityReserved}</td>
                <td className="px-3 py-2">
                  {row.available}
                  {row.lowStock ? (
                    <span className="ml-2 text-xs text-destructive">low</span>
                  ) : null}
                </td>
                <td className="px-3 py-2">
                  <Link
                    className="text-primary underline"
                    href={`/guardian/inventory/stock/${row.productVariantId}`}
                  >
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
