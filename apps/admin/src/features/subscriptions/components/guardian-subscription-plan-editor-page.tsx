"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  archiveAdminSubscriptionPlan,
  createAdminSubscriptionPlan,
  getAdminSubscriptionPlan,
  publishAdminSubscriptionPlan,
  restoreAdminSubscriptionPlan,
  unpublishAdminSubscriptionPlan,
  updateAdminSubscriptionPlan,
} from "@/features/subscriptions/api/admin-subscription-plans-api";
import {
  formatMoneyCents,
  getErrorMessage,
  statusLabel,
} from "@/features/subscriptions/lib/format";
import type {
  PlanProductBinding,
  SubscriptionBillingInterval,
  SubscriptionPlan,
} from "@/features/subscriptions/types";
import { getAdminProduct, listAdminProducts } from "@/features/products/api/products-api";
import type { Product } from "@/features/products/types";

const INTERVALS: SubscriptionBillingInterval[] = [
  "WEEK",
  "MONTH",
  "QUARTER",
  "YEAR",
  "CUSTOM",
];

type BindingDraft = {
  productId: string;
  variantId: string;
  quantity: string;
};

function emptyBinding(): BindingDraft {
  return { productId: "", variantId: "", quantity: "1" };
}

function toBindings(drafts: BindingDraft[]): PlanProductBinding[] {
  return drafts
    .filter((row) => row.productId && row.variantId)
    .map((row) => ({
      productId: row.productId,
      variantId: row.variantId,
      quantity: Math.max(1, Number(row.quantity) || 1),
    }));
}

export function GuardianSubscriptionPlanEditorPage({
  mode,
}: {
  mode: "create" | "edit";
}) {
  const params = useParams<{ id?: string }>();
  const router = useRouter();
  const planId = params.id;

  const [plan, setPlan] = useState<SubscriptionPlan | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [billingInterval, setBillingInterval] =
    useState<SubscriptionBillingInterval>("MONTH");
  const [intervalCount, setIntervalCount] = useState("1");
  const [customIntervalDays, setCustomIntervalDays] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [priceCents, setPriceCents] = useState("0");
  const [gracePeriodDays, setGracePeriodDays] = useState("0");
  const [requiresReassessment, setRequiresReassessment] = useState(false);
  const [reassessmentIntervalCycles, setReassessmentIntervalCycles] =
    useState("");
  const [bindings, setBindings] = useState<BindingDraft[]>([emptyBinding()]);

  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<
    Record<string, Product>
  >({});

  const [loading, setLoading] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "edit" || !planId) return;
    void getAdminSubscriptionPlan(planId)
      .then((row) => {
        setPlan(row);
        setName(row.name);
        setSlug(row.slug);
        setDescription(row.description ?? "");
        setBillingInterval(row.billingInterval);
        setIntervalCount(String(row.intervalCount));
        setCustomIntervalDays(
          row.customIntervalDays != null ? String(row.customIntervalDays) : "",
        );
        setCurrency(row.currency);
        setPriceCents(String(row.priceCents));
        setGracePeriodDays(String(row.gracePeriodDays));
        setRequiresReassessment(row.requiresReassessment);
        setReassessmentIntervalCycles(
          row.reassessmentIntervalCycles != null
            ? String(row.reassessmentIntervalCycles)
            : "",
        );
        const rows = Array.isArray(row.productBindings)
          ? row.productBindings
          : [];
        setBindings(
          rows.length > 0
            ? rows.map((binding) => ({
                productId: binding.productId,
                variantId: binding.variantId,
                quantity: String(binding.quantity),
              }))
            : [emptyBinding()],
        );
      })
      .catch((err) => setError(getErrorMessage(err, "Unable to load plan.")))
      .finally(() => setLoading(false));
  }, [mode, planId]);

  async function searchProducts() {
    try {
      const result = await listAdminProducts({
        q: productQuery.trim() || undefined,
        take: 20,
      });
      setProductResults(result.items);
    } catch (err) {
      setError(getErrorMessage(err, "Unable to search products."));
    }
  }

  async function applyProduct(index: number, product: Product) {
    let full = selectedProducts[product.id] ?? product;
    if (!full.variants?.length) {
      try {
        full = await getAdminProduct(product.id);
      } catch (err) {
        setError(getErrorMessage(err, "Unable to load product variants."));
        return;
      }
    }
    setSelectedProducts((prev) => ({ ...prev, [full.id]: full }));
    setBindings((prev) =>
      prev.map((row, i) =>
        i === index
          ? {
              ...row,
              productId: full.id,
              variantId: full.variants[0]?.id ?? "",
            }
          : row,
      ),
    );
    setProductResults([]);
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      billingInterval,
      intervalCount: Math.max(1, Number(intervalCount) || 1),
      customIntervalDays:
        billingInterval === "CUSTOM"
          ? Math.max(1, Number(customIntervalDays) || 1)
          : null,
      currency: currency.trim() || "USD",
      priceCents: Math.max(0, Number(priceCents) || 0),
      productBindings: toBindings(bindings),
      gracePeriodDays: Math.max(0, Number(gracePeriodDays) || 0),
      requiresReassessment,
      reassessmentIntervalCycles: reassessmentIntervalCycles
        ? Math.max(1, Number(reassessmentIntervalCycles) || 1)
        : null,
    };
    setSaving(true);
    setError(null);
    try {
      if (mode === "create") {
        const created = await createAdminSubscriptionPlan({
          ...payload,
          slug: slug.trim() || undefined,
        });
        router.push(`/guardian/subscriptions/plans/${created.id}/edit`);
        return;
      }
      if (!planId) return;
      const updated = await updateAdminSubscriptionPlan(planId, payload);
      setPlan(updated);
      setMessage("Plan saved.");
    } catch (err) {
      setError(getErrorMessage(err, "Unable to save plan."));
    } finally {
      setSaving(false);
    }
  }

  async function runPlanAction(
    label: string,
    work: () => Promise<SubscriptionPlan>,
  ) {
    setBusy(true);
    setError(null);
    try {
      const updated = await work();
      setPlan(updated);
      setMessage(label);
    } catch (err) {
      setError(getErrorMessage(err, "Unable to complete plan action."));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="px-6 py-10 text-sm text-muted-foreground">
        Loading plan…
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-8 md:px-6">
      <div>
        <Link
          href="/guardian/subscriptions/plans"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Plans
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          {mode === "create" ? "Create plan" : plan?.name ?? "Edit plan"}
        </h1>
        {plan ? (
          <p className="mt-1 text-sm text-muted-foreground">
            {statusLabel(plan.lifecycleStatus)} · {plan.slug} ·{" "}
            {formatMoneyCents(plan.priceCents, plan.currency)}
          </p>
        ) : null}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}

      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="space-y-1">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        {mode === "create" ? (
          <div className="space-y-1">
            <Label htmlFor="slug">Slug (optional)</Label>
            <Input
              id="slug"
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
            />
          </div>
        ) : null}
        <div className="space-y-1">
          <Label htmlFor="description">Description</Label>
          <textarea
            id="description"
            className="min-h-20 w-full rounded-md border border-input bg-background p-2 text-sm"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="interval">Billing interval</Label>
            <select
              id="interval"
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={billingInterval}
              onChange={(event) =>
                setBillingInterval(
                  event.target.value as SubscriptionBillingInterval,
                )
              }
            >
              {INTERVALS.map((interval) => (
                <option key={interval} value={interval}>
                  {interval}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="intervalCount">Interval count</Label>
            <Input
              id="intervalCount"
              type="number"
              min={1}
              value={intervalCount}
              onChange={(event) => setIntervalCount(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="customDays">Custom days</Label>
            <Input
              id="customDays"
              type="number"
              min={1}
              disabled={billingInterval !== "CUSTOM"}
              value={customIntervalDays}
              onChange={(event) => setCustomIntervalDays(event.target.value)}
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="priceCents">Price cents</Label>
            <Input
              id="priceCents"
              type="number"
              min={0}
              value={priceCents}
              onChange={(event) => setPriceCents(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="currency">Currency</Label>
            <Input
              id="currency"
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="grace">Grace period days</Label>
            <Input
              id="grace"
              type="number"
              min={0}
              value={gracePeriodDays}
              onChange={(event) => setGracePeriodDays(event.target.value)}
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={requiresReassessment}
            onChange={(event) => setRequiresReassessment(event.target.checked)}
          />
          Requires reassessment
        </label>
        {requiresReassessment ? (
          <div className="space-y-1">
            <Label htmlFor="reassessmentCycles">Reassessment interval cycles</Label>
            <Input
              id="reassessmentCycles"
              type="number"
              min={1}
              value={reassessmentIntervalCycles}
              onChange={(event) =>
                setReassessmentIntervalCycles(event.target.value)
              }
            />
          </div>
        ) : null}

        <section className="space-y-3 rounded-md border border-border p-4">
          <h2 className="text-sm font-semibold">Product / variant bindings</h2>
          <div className="flex gap-2">
            <Input
              value={productQuery}
              onChange={(event) => setProductQuery(event.target.value)}
              placeholder="Search catalog"
            />
            <Button type="button" variant="outline" onClick={() => void searchProducts()}>
              Search
            </Button>
          </div>
          {productResults.length > 0 ? (
            <ul className="space-y-1 text-sm">
              {productResults.map((product) => (
                <li key={product.id}>
                  <button
                    type="button"
                    className="text-primary underline-offset-4 hover:underline"
                    onClick={() => void applyProduct(0, product)}
                  >
                    {product.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {bindings.map((row, index) => {
            const product = selectedProducts[row.productId];
            return (
              <div key={index} className="grid gap-2 sm:grid-cols-3">
                <Input
                  placeholder="Product ID"
                  value={row.productId}
                  onChange={(event) =>
                    setBindings((prev) =>
                      prev.map((item, i) =>
                        i === index
                          ? { ...item, productId: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
                <select
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  value={row.variantId}
                  onChange={(event) =>
                    setBindings((prev) =>
                      prev.map((item, i) =>
                        i === index
                          ? { ...item, variantId: event.target.value }
                          : item,
                      ),
                    )
                  }
                >
                  <option value="">Variant</option>
                  {(product?.variants ?? []).map((variant) => (
                    <option key={variant.id} value={variant.id}>
                      {variant.sku} ({variant.label ?? variant.id.slice(0, 8)})
                    </option>
                  ))}
                  {!product && row.variantId ? (
                    <option value={row.variantId}>{row.variantId}</option>
                  ) : null}
                </select>
                <Input
                  type="number"
                  min={1}
                  value={row.quantity}
                  onChange={(event) =>
                    setBindings((prev) =>
                      prev.map((item, i) =>
                        i === index
                          ? { ...item, quantity: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
              </div>
            );
          })}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setBindings((prev) => [...prev, emptyBinding()])}
          >
            Add binding
          </Button>
        </section>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : mode === "create" ? "Create draft" : "Save"}
          </Button>
          <Button
            type="button"
            variant="outline"
            render={<Link href="/guardian/subscriptions/plans" />}
          >
            Cancel
          </Button>
        </div>
      </form>

      {mode === "edit" && plan ? (
        <section className="space-y-2 rounded-md border border-border p-4">
          <h2 className="text-sm font-semibold">Plan lifecycle</h2>
          <div className="flex flex-wrap gap-2">
            {plan.lifecycleStatus !== "PUBLISHED" && !plan.archivedAt ? (
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  void runPlanAction("Plan published.", () =>
                    publishAdminSubscriptionPlan(plan.id),
                  )
                }
              >
                Publish
              </Button>
            ) : null}
            {plan.lifecycleStatus === "PUBLISHED" ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void runPlanAction("Plan unpublished.", () =>
                    unpublishAdminSubscriptionPlan(plan.id),
                  )
                }
              >
                Unpublish
              </Button>
            ) : null}
            {!plan.archivedAt ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void runPlanAction("Plan archived.", () =>
                    archiveAdminSubscriptionPlan(plan.id),
                  )
                }
              >
                Archive
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void runPlanAction("Plan restored.", () =>
                    restoreAdminSubscriptionPlan(plan.id),
                  )
                }
              >
                Restore
              </Button>
            )}
          </div>
        </section>
      ) : null}
    </main>
  );
}
