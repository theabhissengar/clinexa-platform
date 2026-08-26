"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { usePermissions } from "@/features/auth/hooks/use-permissions";
import { Permissions } from "@/features/auth/permissions";
import {
  deactivateAdminCoupon,
  deleteAdminCoupon,
  getAdminCoupon,
} from "@/features/coupons/api/admin-coupons-api";
import type { Coupon } from "@/features/coupons/types";
import {
  formatDateTime,
  formatMoneyCents,
  statusLabel,
} from "@/features/orders/lib/format";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-border bg-background p-4">
      <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (
    error &&
    typeof error === "object" &&
    "response" in error &&
    error.response &&
    typeof error.response === "object" &&
    "data" in error.response &&
    error.response.data &&
    typeof error.response.data === "object" &&
    "message" in error.response.data
  ) {
    const message = (error.response.data as { message?: unknown }).message;
    if (typeof message === "string") return message;
    if (Array.isArray(message)) return message.join(", ");
  }
  return fallback;
}

function discountLabel(coupon: Coupon): string {
  if (coupon.discountType === "PERCENT") {
    return `${coupon.discountValue}%`;
  }
  return formatMoneyCents(coupon.discountValue);
}

export function GuardianCouponDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const couponId = params.id;
  const { can } = usePermissions();

  const returnQs = searchParams.get("return");
  const backHref =
    returnQs && returnQs.startsWith("?")
      ? `/guardian/coupons${returnQs}`
      : "/guardian/coupons";

  const [coupon, setCoupon] = useState<Coupon | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canConfigure = can(Permissions.CPN_CONFIGURE);
  const canDelete = can(Permissions.CPN_DELETE);

  const load = useCallback(async () => {
    const detail = await getAdminCoupon(couponId);
    setCoupon(detail);
  }, [couponId]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const detail = await getAdminCoupon(couponId);
        if (cancelled) return;
        setCoupon(detail);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setCoupon(null);
        setError(getErrorMessage(err, "Unable to load coupon."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [couponId]);

  async function onDeactivate() {
    if (!coupon || !canConfigure) return;
    if (!window.confirm(`Deactivate coupon ${coupon.code}?`)) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await deactivateAdminCoupon(coupon.id);
      setMessage("Coupon deactivated.");
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Unable to deactivate coupon."));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!coupon || !canDelete) return;
    if (
      !window.confirm(
        `Soft-delete coupon ${coupon.code}? Redemption history is retained.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await deleteAdminCoupon(coupon.id);
      router.push("/guardian/coupons");
    } catch (err) {
      setError(getErrorMessage(err, "Unable to delete coupon."));
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="px-6 py-10 text-sm text-muted-foreground">
        Loading coupon…
      </main>
    );
  }

  if (!coupon) {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-3 px-4 py-8 md:px-6">
        <Link
          href={backHref}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← All coupons
        </Link>
        <p className="text-sm text-destructive">
          {error ?? "Coupon not found."}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-4 py-8 md:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href={backHref}
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            ← All coupons
          </Link>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">
            {coupon.code}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {coupon.name} · {coupon.isActive ? "Active" : "Inactive"} ·{" "}
            {statusLabel(coupon.discountType)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canConfigure ? (
            <>
              <Button
                size="sm"
                variant="outline"
                render={<Link href={`/guardian/coupons/${coupon.id}/edit`} />}
              >
                Edit
              </Button>
              <Button
                size="sm"
                variant="outline"
                render={
                  <Link href={`/guardian/coupons/${coupon.id}/redemptions`} />
                }
              >
                Redemptions
              </Button>
              {coupon.isActive ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void onDeactivate()}
                >
                  Deactivate
                </Button>
              ) : null}
            </>
          ) : null}
          {canDelete ? (
            <Button
              size="sm"
              variant="destructive"
              disabled={busy}
              onClick={() => void onDelete()}
            >
              Delete
            </Button>
          ) : null}
        </div>
      </div>

      {message ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-400">
          {message}
        </p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Section title="Discount">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Type</dt>
            <dd>{statusLabel(coupon.discountType)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Value</dt>
            <dd>{discountLabel(coupon)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Min order</dt>
            <dd className="tabular-nums">
              {coupon.minOrderCents != null
                ? formatMoneyCents(coupon.minOrderCents)
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Max discount</dt>
            <dd className="tabular-nums">
              {coupon.maxDiscountCents != null
                ? formatMoneyCents(coupon.maxDiscountCents)
                : "—"}
            </dd>
          </div>
        </dl>
      </Section>

      <Section title="Schedule & scope">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Starts</dt>
            <dd>{formatDateTime(coupon.startsAt)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Ends</dt>
            <dd>{formatDateTime(coupon.endsAt)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Scope</dt>
            <dd>{statusLabel(coupon.scopeType)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Applicability</dt>
            <dd>{statusLabel(coupon.applicability)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Automatic</dt>
            <dd>{coupon.isAutomatic ? "Yes" : "No"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Stacking group</dt>
            <dd>{coupon.stackingGroup ?? "—"}</dd>
          </div>
        </dl>
      </Section>

      <Section title="Usage">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Usage count</dt>
            <dd className="tabular-nums">{coupon.usageCount}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Global limit</dt>
            <dd className="tabular-nums">
              {coupon.globalUsageLimit ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Per-user limit</dt>
            <dd className="tabular-nums">
              {coupon.perUserUsageLimit ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Priority</dt>
            <dd className="tabular-nums">{coupon.priority ?? "—"}</dd>
          </div>
        </dl>
      </Section>

      {(coupon.scopeProductIds?.length || coupon.scopeCategoryIds?.length) && (
        <Section title="Target IDs">
          {coupon.scopeProductIds?.length ? (
            <p className="text-sm font-mono text-xs break-all">
              Products: {coupon.scopeProductIds.join(", ")}
            </p>
          ) : null}
          {coupon.scopeCategoryIds?.length ? (
            <p className="mt-2 text-sm font-mono text-xs break-all">
              Categories: {coupon.scopeCategoryIds.join(", ")}
            </p>
          ) : null}
        </Section>
      )}

      {coupon.description ? (
        <Section title="Description">
          <p className="text-sm whitespace-pre-wrap">{coupon.description}</p>
        </Section>
      ) : null}
    </main>
  );
}
