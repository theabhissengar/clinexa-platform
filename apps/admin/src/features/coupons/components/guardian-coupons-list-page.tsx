"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { usePermissions } from "@/features/auth/hooks/use-permissions";
import { Permissions } from "@/features/auth/permissions";
import { listAdminCoupons } from "@/features/coupons/api/admin-coupons-api";
import type { Coupon } from "@/features/coupons/types";
import {
  formatDateTime,
  formatMoneyCents,
} from "@/features/orders/lib/format";
import { ClearableSearchInput } from "@/features/products/components/clearable-search-input";
import { ListPaginationBar } from "@/features/products/components/list-pagination-bar";

const PAGE_SIZE = 20;

function parsePage(value: string | null): number {
  const n = Number(value ?? "1");
  if (!Number.isFinite(n) || n < 1) return 0;
  return Math.floor(n) - 1;
}

function discountLabel(coupon: Coupon): string {
  if (coupon.discountType === "PERCENT") {
    return `${coupon.discountValue}%`;
  }
  return formatMoneyCents(coupon.discountValue);
}

export function GuardianCouponsListPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { can } = usePermissions();
  const q = searchParams.get("q") ?? "";
  const page = parsePage(searchParams.get("page"));
  const [items, setItems] = useState<Coupon[]>([]);
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
        const result = await listAdminCoupons({
          q: q || undefined,
          skip: page * PAGE_SIZE,
          take: PAGE_SIZE,
        });
        if (cancelled) return;
        setItems(result.items);
        setTotal(result.total);
        setError(null);
      } catch {
        if (cancelled) return;
        setError("Unable to load coupons.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [q, page]);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-8 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Coupons</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Promotional codes. Pricing is calculated by Promotions, not
            Payments.
          </p>
        </div>
        {can(Permissions.CPN_CONFIGURE) ? (
          <Button size="sm" render={<Link href="/guardian/coupons/new" />}>
            New coupon
          </Button>
        ) : null}
      </div>
      <ClearableSearchInput
        value={q}
        onChange={(value) => writeParams({ q: value, page: "1" })}
        onClear={() => writeParams({ q: null, page: "1" })}
        placeholder="Search code or name"
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-border bg-muted/40">
            <tr>
              <th className="px-3 py-2 font-medium">Code</th>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Discount</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Usage</th>
              <th className="px-3 py-2 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-3 py-6 text-muted-foreground" colSpan={6}>
                  Loading…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-muted-foreground" colSpan={6}>
                  No coupons.
                </td>
              </tr>
            ) : (
              items.map((coupon) => (
                <tr key={coupon.id} className="border-t border-border">
                  <td className="px-3 py-2 font-mono">
                    <Link
                      href={`/guardian/coupons/${coupon.id}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {coupon.code}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{coupon.name}</td>
                  <td className="px-3 py-2">{discountLabel(coupon)}</td>
                  <td className="px-3 py-2">
                    {coupon.isActive ? "Active" : "Inactive"}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {coupon.usageCount}
                    {coupon.globalUsageLimit != null
                      ? ` / ${coupon.globalUsageLimit}`
                      : ""}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {formatDateTime(coupon.updatedAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
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
