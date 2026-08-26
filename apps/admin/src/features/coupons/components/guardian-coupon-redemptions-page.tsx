"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import {
  getAdminCoupon,
  listAdminCouponRedemptions,
} from "@/features/coupons/api/admin-coupons-api";
import type { Coupon, CouponRedemption } from "@/features/coupons/types";
import {
  formatDateTime,
  formatMoneyCents,
  statusLabel,
} from "@/features/orders/lib/format";
import { ListPaginationBar } from "@/features/products/components/list-pagination-bar";

const PAGE_SIZE = 20;

function parsePage(value: string | null): number {
  const n = Number(value ?? "1");
  if (!Number.isFinite(n) || n < 1) return 0;
  return Math.floor(n) - 1;
}

export function GuardianCouponRedemptionsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const couponId = params.id;
  const page = parsePage(searchParams.get("page"));

  const [coupon, setCoupon] = useState<Coupon | null>(null);
  const [items, setItems] = useState<CouponRedemption[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function writeParams(patch: Record<string, string | null | undefined>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value == null || value === "") next.delete(key);
      else next.set(key, value);
    }
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      try {
        const [detail, redemptions] = await Promise.all([
          getAdminCoupon(couponId),
          listAdminCouponRedemptions(couponId, {
            skip: page * PAGE_SIZE,
            take: PAGE_SIZE,
          }),
        ]);
        if (cancelled) return;
        setCoupon(detail);
        setItems(redemptions.items);
        setTotal(redemptions.total);
        setError(null);
      } catch {
        if (cancelled) return;
        setError("Unable to load redemptions.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [couponId, page]);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-6 py-8">
      <div>
        <Link
          href={`/guardian/coupons/${couponId}`}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Coupon detail
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          Redemptions
          {coupon ? (
            <span className="text-muted-foreground"> · {coupon.code}</span>
          ) : null}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Redemption history for this coupon.
        </p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading redemptions…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No redemptions yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Redeemed</th>
                <th className="px-3 py-2 font-medium">Order</th>
                <th className="px-3 py-2 font-medium">Patient</th>
                <th className="px-3 py-2 font-medium">Discount</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id} className="border-b border-border">
                  <td className="px-3 py-2">
                    {formatDateTime(row.redeemedAt)}
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/guardian/orders/${row.orderId}`}
                      className="font-mono text-xs text-primary hover:underline"
                    >
                      {row.orderId.slice(0, 8)}…
                    </Link>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {row.patientUserId.slice(0, 8)}…
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {formatMoneyCents(row.discountAppliedCents)}
                  </td>
                  <td className="px-3 py-2">{statusLabel(row.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ListPaginationBar
        total={total}
        page={page}
        pageCount={pageCount}
        onPrev={() => writeParams({ page: String(page) })}
        onNext={() => writeParams({ page: String(page + 2) })}
      />
    </main>
  );
}
