"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AppSelect } from "@/components/patterns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listAdminCategories } from "@/features/categories/api/categories-api";
import {
  createAdminCoupon,
  getAdminCoupon,
  updateAdminCoupon,
} from "@/features/coupons/api/admin-coupons-api";
import { buildCouponFormPayload } from "@/features/coupons/lib/coupon-form-payload";
import type {
  CouponDiscountType,
  CouponScopeType,
} from "@/features/coupons/types";
import { listAdminProducts } from "@/features/products/api/products-api";

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

type CatalogOption = { id: string; name: string };

export function GuardianCouponFormPage({
  mode,
}: {
  mode: "create" | "edit";
}) {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [discountType, setDiscountType] =
    useState<CouponDiscountType>("PERCENT");
  const [discountValue, setDiscountValue] = useState("10");
  const [minOrderCents, setMinOrderCents] = useState("");
  const [maxDiscountCents, setMaxDiscountCents] = useState("");
  const [scopeType, setScopeType] = useState<CouponScopeType>("ALL");
  const [scopeProductIds, setScopeProductIds] = useState<string[]>([]);
  const [scopeCategoryIds, setScopeCategoryIds] = useState<string[]>([]);
  const [productOptions, setProductOptions] = useState<CatalogOption[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<CatalogOption[]>([]);
  const [productQuery, setProductQuery] = useState("");
  const [categoryQuery, setCategoryQuery] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [globalUsageLimit, setGlobalUsageLimit] = useState("");
  const [perUserUsageLimit, setPerUserUsageLimit] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(mode === "edit");

  useEffect(() => {
    if (mode !== "edit") return;
    let cancelled = false;
    async function run() {
      try {
        const coupon = await getAdminCoupon(params.id);
        if (cancelled) return;
        setCode(coupon.code);
        setName(coupon.name);
        setDescription(coupon.description ?? "");
        setDiscountType(coupon.discountType);
        setDiscountValue(String(coupon.discountValue));
        setMinOrderCents(
          coupon.minOrderCents != null ? String(coupon.minOrderCents) : "",
        );
        setMaxDiscountCents(
          coupon.maxDiscountCents != null
            ? String(coupon.maxDiscountCents)
            : "",
        );
        setScopeType(coupon.scopeType);
        setScopeProductIds(coupon.scopeProductIds ?? []);
        setScopeCategoryIds(coupon.scopeCategoryIds ?? []);
        setStartsAt(coupon.startsAt ? coupon.startsAt.slice(0, 16) : "");
        setEndsAt(coupon.endsAt ? coupon.endsAt.slice(0, 16) : "");
        setGlobalUsageLimit(
          coupon.globalUsageLimit != null
            ? String(coupon.globalUsageLimit)
            : "",
        );
        setPerUserUsageLimit(
          coupon.perUserUsageLimit != null
            ? String(coupon.perUserUsageLimit)
            : "",
        );
        const [products, categories] = await Promise.all([
          coupon.scopeProductIds?.length
            ? listAdminProducts({ take: 100 })
            : Promise.resolve({ items: [] as Array<{ id: string; name: string }> }),
          coupon.scopeCategoryIds?.length
            ? listAdminCategories({ take: 100 })
            : Promise.resolve({ items: [] as Array<{ id: string; name: string }> }),
        ]);
        if (cancelled) return;
        const productById = new Map(
          products.items.map((item) => [item.id, { id: item.id, name: item.name }]),
        );
        for (const id of coupon.scopeProductIds ?? []) {
          if (!productById.has(id)) {
            productById.set(id, { id, name: id });
          }
        }
        const categoryById = new Map(
          categories.items.map((item) => [
            item.id,
            { id: item.id, name: item.name },
          ]),
        );
        for (const id of coupon.scopeCategoryIds ?? []) {
          if (!categoryById.has(id)) {
            categoryById.set(id, { id, name: id });
          }
        }
        setProductOptions([...productById.values()]);
        setCategoryOptions([...categoryById.values()]);
      } catch (err) {
        if (!cancelled) {
          setError(getErrorMessage(err, "Unable to load coupon."));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [mode, params.id]);

  async function searchProducts() {
    try {
      const result = await listAdminProducts({
        q: productQuery.trim() || undefined,
        take: 20,
      });
      setProductOptions(
        result.items.map((item) => ({ id: item.id, name: item.name })),
      );
    } catch (err) {
      setError(getErrorMessage(err, "Unable to search products."));
    }
  }

  async function searchCategories() {
    try {
      const result = await listAdminCategories({
        q: categoryQuery.trim() || undefined,
        take: 20,
      });
      setCategoryOptions(
        result.items.map((item) => ({ id: item.id, name: item.name })),
      );
    } catch (err) {
      setError(getErrorMessage(err, "Unable to search categories."));
    }
  }

  function toggleId(
    list: string[],
    setList: (next: string[]) => void,
    id: string,
  ) {
    setList(list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (scopeType === "PRODUCT" && scopeProductIds.length === 0) {
      setError("Select at least one product for PRODUCT scope.");
      return;
    }
    if (scopeType === "CATEGORY" && scopeCategoryIds.length === 0) {
      setError("Select at least one category for CATEGORY scope.");
      return;
    }
    setBusy(true);
    setError(null);
    const payload = buildCouponFormPayload({
      code,
      name,
      description,
      discountType,
      discountValue,
      minOrderCents,
      maxDiscountCents,
      scopeType,
      scopeProductIds,
      scopeCategoryIds,
      startsAt,
      endsAt,
      globalUsageLimit,
      perUserUsageLimit,
    });
    try {
      if (mode === "create") {
        const created = await createAdminCoupon(payload);
        router.push(`/guardian/coupons/${created.id}`);
      } else {
        const { code: _code, ...update } = payload;
        void _code;
        await updateAdminCoupon(params.id, update);
        router.push(`/guardian/coupons/${params.id}`);
      }
    } catch (err) {
      setError(getErrorMessage(err, "Unable to save coupon."));
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

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-8 md:px-6">
      <Link
        href={
          mode === "edit"
            ? `/guardian/coupons/${params.id}`
            : "/guardian/coupons"
        }
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← Back
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          {mode === "create" ? "New coupon" : "Edit coupon"}
        </h1>
        <Button
          type="submit"
          form="guardian-coupon-form"
          className="shrink-0"
          disabled={busy}
        >
          {busy ? "Saving…" : "Save coupon"}
        </Button>
      </div>
      <form
        id="guardian-coupon-form"
        className="grid gap-4"
        onSubmit={(event) => void onSubmit(event)}
      >
        <div className="grid gap-1">
          <Label htmlFor="code">Code</Label>
          <Input
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            disabled={mode === "edit"}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="description">Description</Label>
          <Input
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1">
            <Label htmlFor="discountType">Discount type</Label>
            <AppSelect
              value={discountType}
              onValueChange={(next) =>
                setDiscountType(next as CouponDiscountType)
              }
              aria-label="Discount type"
              options={[
                { value: "PERCENT", label: "Percent" },
                { value: "FIXED", label: "Fixed cents" },
              ]}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="discountValue">
              {discountType === "PERCENT" ? "Percent" : "Amount (cents)"}
            </Label>
            <Input
              id="discountValue"
              type="number"
              min={1}
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              required
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1">
            <Label htmlFor="minOrderCents">Min order (cents)</Label>
            <Input
              id="minOrderCents"
              type="number"
              min={0}
              value={minOrderCents}
              onChange={(e) => setMinOrderCents(e.target.value)}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="maxDiscountCents">Max discount (cents)</Label>
            <Input
              id="maxDiscountCents"
              type="number"
              min={0}
              value={maxDiscountCents}
              onChange={(e) => setMaxDiscountCents(e.target.value)}
            />
          </div>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="scopeType">Scope</Label>
          <AppSelect
            value={scopeType}
            onValueChange={(next) => setScopeType(next as CouponScopeType)}
            aria-label="Scope"
            options={[
              { value: "ALL", label: "All products" },
              { value: "PRODUCT", label: "Product" },
              { value: "CATEGORY", label: "Category" },
            ]}
          />
        </div>
        {scopeType === "PRODUCT" ? (
          <div className="grid gap-2 rounded-md border border-border p-3">
            <Label htmlFor="productQuery">Products in scope</Label>
            <div className="flex gap-2">
              <Input
                id="productQuery"
                value={productQuery}
                onChange={(e) => setProductQuery(e.target.value)}
                placeholder="Search catalog products"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void searchProducts()}
              >
                Search
              </Button>
            </div>
            <ul className="grid max-h-48 gap-1 overflow-auto text-sm">
              {productOptions.map((item) => (
                <li key={item.id}>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={scopeProductIds.includes(item.id)}
                      onChange={() =>
                        toggleId(scopeProductIds, setScopeProductIds, item.id)
                      }
                    />
                    <span>{item.name}</span>
                  </label>
                </li>
              ))}
            </ul>
            {scopeProductIds.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                Selected {scopeProductIds.length} product
                {scopeProductIds.length === 1 ? "" : "s"}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Select at least one product. IDs are sent as scopeProductIds.
              </p>
            )}
          </div>
        ) : null}
        {scopeType === "CATEGORY" ? (
          <div className="grid gap-2 rounded-md border border-border p-3">
            <Label htmlFor="categoryQuery">Categories in scope</Label>
            <div className="flex gap-2">
              <Input
                id="categoryQuery"
                value={categoryQuery}
                onChange={(e) => setCategoryQuery(e.target.value)}
                placeholder="Search catalog categories"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void searchCategories()}
              >
                Search
              </Button>
            </div>
            <ul className="grid max-h-48 gap-1 overflow-auto text-sm">
              {categoryOptions.map((item) => (
                <li key={item.id}>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={scopeCategoryIds.includes(item.id)}
                      onChange={() =>
                        toggleId(scopeCategoryIds, setScopeCategoryIds, item.id)
                      }
                    />
                    <span>{item.name}</span>
                  </label>
                </li>
              ))}
            </ul>
            {scopeCategoryIds.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                Selected {scopeCategoryIds.length} categor
                {scopeCategoryIds.length === 1 ? "y" : "ies"}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Select at least one category. IDs are sent as scopeCategoryIds.
              </p>
            )}
          </div>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1">
            <Label htmlFor="startsAt">Starts</Label>
            <Input
              id="startsAt"
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="endsAt">Ends</Label>
            <Input
              id="endsAt"
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1">
            <Label htmlFor="globalUsageLimit">Global usage limit</Label>
            <Input
              id="globalUsageLimit"
              type="number"
              min={1}
              value={globalUsageLimit}
              onChange={(e) => setGlobalUsageLimit(e.target.value)}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="perUserUsageLimit">Per-user usage limit</Label>
            <Input
              id="perUserUsageLimit"
              type="number"
              min={1}
              value={perUserUsageLimit}
              onChange={(e) => setPerUserUsageLimit(e.target.value)}
            />
          </div>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </form>
    </main>
  );
}
