"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RequirePermission } from "@/components/auth/require-permission";
import { Permissions } from "@/features/auth/permissions";
import { listAdminCategories } from "@/features/categories/api/categories-api";
import {
  attachMedia,
  createProduct,
  createVariant,
  deleteProduct,
  deleteVariant,
  getAdminProduct,
  getProductInventorySummary,
  listAdminProducts,
  transitionProduct,
  updateProduct,
  updateVariant,
} from "@/features/products/api/products-api";
import {
  ProductDataPanel,
  type DataTab,
} from "@/features/products/components/product-data-panel";
import {
  DEFAULT_STRIPE_GATEWAYS,
  decimalToInput,
  normalizeAttributes,
  parseDecimalInput,
} from "@/features/products/lib/product-data-defaults";
import type {
  Category,
  CreateProductPayload,
  Product,
  ProductAttributeDef,
  ProductLifecycleStatus,
  ProductType,
  StripeGatewayPref,
} from "@/features/products/types";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

type Props = {
  mode: "create" | "edit";
  productId?: string;
};

export function ProductEditorPage({ mode, productId }: Props) {
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [catalogOptions, setCatalogOptions] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [dataTab, setDataTab] = useState<DataTab>("general");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [inventoryMessage, setInventoryMessage] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugLocked, setSlugLocked] = useState(mode === "edit");
  const [description, setDescription] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [productType, setProductType] =
    useState<ProductType>("VARIABLE_SUBSCRIPTION");
  const [isRxEligible, setIsRxEligible] = useState(false);
  const [isFeatured, setIsFeatured] = useState(false);
  const [brandName, setBrandName] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [seoCanonical, setSeoCanonical] = useState("");
  const [featuredMediaAssetId, setFeaturedMediaAssetId] = useState("");
  const [galleryAssetId, setGalleryAssetId] = useState("");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [questionnaireBindingRef, setQuestionnaireBindingRef] = useState("");
  const [regularPrice, setRegularPrice] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [primaryVariantId, setPrimaryVariantId] = useState<string | null>(null);
  const [variantSku, setVariantSku] = useState("");
  const [newSku, setNewSku] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newSalePrice, setNewSalePrice] = useState("");
  const [newAttributeName, setNewAttributeName] = useState("");

  const [gtin, setGtin] = useState("");
  const [soldIndividually, setSoldIndividually] = useState(false);
  const [weightLbs, setWeightLbs] = useState("");
  const [lengthIn, setLengthIn] = useState("");
  const [widthIn, setWidthIn] = useState("");
  const [heightIn, setHeightIn] = useState("");
  const [shippingClass, setShippingClass] = useState("");
  const [oneTimeShipping, setOneTimeShipping] = useState(false);
  const [upsellIds, setUpsellIds] = useState<string[]>([]);
  const [crossSellIds, setCrossSellIds] = useState<string[]>([]);
  const [bundleSellIds, setBundleSellIds] = useState<string[]>([]);
  const [bundleSellsTitle, setBundleSellsTitle] = useState("");
  const [bundleSellsDiscount, setBundleSellsDiscount] = useState("");
  const [catalogAttributes, setCatalogAttributes] = useState<
    ProductAttributeDef[]
  >([]);
  const [defaultVariationOptions, setDefaultVariationOptions] = useState<
    Record<string, string>
  >({});
  const [purchaseNote, setPurchaseNote] = useState("");
  const [menuOrder, setMenuOrder] = useState("0");
  const [enableReviews, setEnableReviews] = useState(true);
  const [limitSubscription, setLimitSubscription] = useState("none");
  const [stripeButtonPosition, setStripeButtonPosition] = useState(
    "below_add_to_cart",
  );
  const [stripeGateways, setStripeGateways] = useState<StripeGatewayPref[]>(
    DEFAULT_STRIPE_GATEWAYS,
  );

  const hydrate = useCallback((next: Product) => {
    setProduct(next);
    setName(next.name);
    setSlug(next.slug);
    setSlugLocked(true);
    setDescription(next.description ?? "");
    setShortDescription(next.shortDescription ?? "");
    setProductType(next.productType ?? "STANDARD");
    setIsRxEligible(next.isRxEligible);
    setIsFeatured(next.isFeatured);
    setBrandName(next.brandName ?? "");
    setTagsText(next.tags.join(", "));
    setSeoTitle(next.seoTitle ?? "");
    setSeoDescription(next.seoDescription ?? "");
    setSeoCanonical(next.seoCanonical ?? "");
    setFeaturedMediaAssetId(next.featuredMediaAssetId ?? "");
    setSelectedCategoryIds(next.categoryLinks.map((l) => l.category.id));
    setQuestionnaireBindingRef(next.questionnaireBindingRef ?? "");
    const attrs = normalizeAttributes(next.attributes);
    const medical = (next.medicalInfo ?? {}) as {
      din?: string;
      dosage?: string;
      byAttribute?: Array<{ name?: string; din?: string; dose?: string }>;
    };
    // Migrate legacy product-level DIN/dose onto attributes when needed.
    if (attrs.length && medical.byAttribute?.length) {
      for (const row of medical.byAttribute) {
        const match = attrs.find((a) => a.name === row.name);
        if (!match) continue;
        if (!match.din && row.din) match.din = row.din;
        if (!match.dose && row.dose) match.dose = row.dose;
      }
    } else if (attrs.length && (medical.din || medical.dosage)) {
      if (!attrs[0].din && medical.din) attrs[0].din = medical.din;
      if (!attrs[0].dose && medical.dosage) attrs[0].dose = medical.dosage;
    }
    setCatalogAttributes(attrs);
    setGtin(next.gtin ?? "");
    setSoldIndividually(Boolean(next.soldIndividually));
    setWeightLbs(decimalToInput(next.weightLbs));
    setLengthIn(decimalToInput(next.lengthIn));
    setWidthIn(decimalToInput(next.widthIn));
    setHeightIn(decimalToInput(next.heightIn));
    setShippingClass(next.shippingClass ?? "");
    setOneTimeShipping(Boolean(next.oneTimeShipping));
    setBundleSellsTitle(next.bundleSellsTitle ?? "");
    setBundleSellsDiscount(next.bundleSellsDiscount ?? "");
    setDefaultVariationOptions(next.defaultVariationOptions ?? {});
    setPurchaseNote(next.purchaseNote ?? "");
    setMenuOrder(String(next.menuOrder ?? 0));
    setEnableReviews(next.enableReviews ?? true);
    setLimitSubscription(next.limitSubscription || "none");
    setStripeButtonPosition(
      next.stripeButtonPosition || "below_add_to_cart",
    );
    setStripeGateways(
      Array.isArray(next.stripeGateways) && next.stripeGateways.length
        ? next.stripeGateways
        : DEFAULT_STRIPE_GATEWAYS,
    );

    const relations = next.relationsFrom ?? [];
    setUpsellIds(
      relations
        .filter((r) => r.relationType === "upsell")
        .map((r) => r.target.id),
    );
    setCrossSellIds(
      relations
        .filter((r) => r.relationType === "cross_sell")
        .map((r) => r.target.id),
    );
    setBundleSellIds(
      relations
        .filter((r) => r.relationType === "bundle_sell")
        .map((r) => r.target.id),
    );

    const primary = next.variants[0];
    if (primary) {
      setPrimaryVariantId(primary.id);
      setVariantSku(primary.sku);
      setRegularPrice((primary.priceCents / 100).toFixed(2));
      setSalePrice(
        primary.salePriceCents != null
          ? (primary.salePriceCents / 100).toFixed(2)
          : "",
      );
    }
  }, []);

  useEffect(() => {
    void listAdminCategories()
      .then((r) => setCategories(r.items))
      .catch(() => undefined);
    void listAdminProducts({ take: 100 })
      .then((r) =>
        setCatalogOptions(r.items.map((p) => ({ id: p.id, name: p.name }))),
      )
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (mode !== "edit" || !productId) return;
    void getAdminProduct(productId)
      .then(async (next) => {
        hydrate(next);
        try {
          const inv = await getProductInventorySummary(productId);
          setInventoryMessage(inv.message);
        } catch {
          setInventoryMessage(null);
        }
      })
      .catch(() => setError("Unable to load product."));
  }, [mode, productId, hydrate]);

  function buildPayload(): CreateProductPayload {
    const tags = tagsText
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    return {
      name,
      slug: slug || slugify(name),
      description: description || undefined,
      shortDescription: shortDescription || undefined,
      productType,
      isRxEligible,
      isFeatured,
      brandName: brandName || undefined,
      featuredMediaAssetId: featuredMediaAssetId || undefined,
      seoTitle: seoTitle || name,
      seoDescription: seoDescription || undefined,
      seoCanonical: seoCanonical || undefined,
      tags,
      categoryIds: selectedCategoryIds,
      questionnaireBindingRef: questionnaireBindingRef || undefined,
      // Derived summary for consumers that still read medicalInfo; source of
      // truth for DIN/dose is per-attribute on `attributes`.
      medicalInfo: {
        byAttribute: catalogAttributes.map((a) => ({
          name: a.name,
          din: a.din || undefined,
          dose: a.dose || undefined,
        })),
        din: catalogAttributes.find((a) => a.din)?.din || undefined,
        dosage: catalogAttributes.find((a) => a.dose)?.dose || undefined,
      },
      attributes: catalogAttributes,
      gtin: gtin || null,
      soldIndividually,
      weightLbs: parseDecimalInput(weightLbs),
      lengthIn: parseDecimalInput(lengthIn),
      widthIn: parseDecimalInput(widthIn),
      heightIn: parseDecimalInput(heightIn),
      shippingClass: shippingClass || null,
      oneTimeShipping,
      bundleSellsTitle: bundleSellsTitle || null,
      bundleSellsDiscount: bundleSellsDiscount || null,
      defaultVariationOptions,
      purchaseNote: purchaseNote || null,
      menuOrder: Number(menuOrder) || 0,
      enableReviews,
      limitSubscription: limitSubscription || "none",
      stripeButtonPosition: stripeButtonPosition || null,
      stripeGateways,
      upsellIds,
      crossSellIds,
      bundleSellIds,
    };
  }

  async function syncPrimaryPricing(id: string) {
    const priceCents = Math.round(parseFloat(regularPrice || "0") * 100);
    const salePriceCents = salePrice
      ? Math.round(parseFloat(salePrice) * 100)
      : null;
    if (Number.isNaN(priceCents)) return;

    if (primaryVariantId) {
      await updateVariant(id, primaryVariantId, {
        sku: variantSku || undefined,
        priceCents,
        salePriceCents,
      });
    } else if (regularPrice || variantSku) {
      const sku =
        variantSku ||
        `${slugify(name || "product")}-${Date.now().toString(36)}`;
      await createVariant(id, {
        sku,
        priceCents: Number.isNaN(priceCents) ? 0 : priceCents,
        salePriceCents: salePriceCents ?? undefined,
      });
    }
  }

  async function onSave(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const payload = buildPayload();
      if (mode === "create") {
        const created = await createProduct(payload);
        await syncPrimaryPricing(created.id);
        router.push(`/guardian/products/${created.id}/edit`);
        return;
      }
      if (!productId) return;
      await updateProduct(productId, payload);
      await syncPrimaryPricing(productId);
      const refreshed = await getAdminProduct(productId);
      hydrate(refreshed);
      setMessage("Product updated.");
    } catch {
      setError(
        "Unable to save product. Check required fields and slug uniqueness.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function runTransition(status: ProductLifecycleStatus) {
    if (!productId) return;
    setError(null);
    try {
      const next = await transitionProduct(productId, status);
      hydrate(next);
      setMessage(`Status → ${status}`);
    } catch {
      setError(
        "Lifecycle transition failed. Publish requires SEO title, fulfillable variant, and Rx binding when Rx-eligible.",
      );
    }
  }

  async function onAddVariation() {
    if (!productId || !newSku) return;
    try {
      await createVariant(productId, {
        sku: newSku,
        priceCents: Math.round(parseFloat(newPrice || "0") * 100),
        salePriceCents: newSalePrice
          ? Math.round(parseFloat(newSalePrice) * 100)
          : undefined,
        optionValues: defaultVariationOptions,
      });
      const refreshed = await getAdminProduct(productId);
      hydrate(refreshed);
      setNewSku("");
      setNewPrice("");
      setNewSalePrice("");
    } catch {
      setError("Unable to add variation.");
    }
  }

  async function onRemoveVariation(variantId: string) {
    if (!productId) return;
    try {
      await deleteVariant(productId, variantId);
      const refreshed = await getAdminProduct(productId);
      hydrate(refreshed);
    } catch {
      setError("Unable to remove variation.");
    }
  }

  async function onUpdateVariationOptions(
    variantId: string,
    optionValues: Record<string, string>,
  ) {
    if (!productId) return;
    try {
      await updateVariant(productId, variantId, { optionValues });
      const refreshed = await getAdminProduct(productId);
      hydrate(refreshed);
    } catch {
      setError("Unable to update variation options.");
    }
  }

  const statusLabel =
    product?.lifecycleStatus === "UNPUBLISHED"
      ? "Private"
      : (product?.lifecycleStatus ?? "DRAFT");

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-8 md:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/guardian/products"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            ← All products
          </Link>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">
            {mode === "create" ? "Add product" : name || "Edit product"}
          </h1>
          {mode === "edit" && productId ? (
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              ID: {productId}
            </p>
          ) : null}
          {mode === "edit" && product ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Permalink:{" "}
              <span className="text-primary">/products/{slug}</span>
              {!slugLocked ? null : (
                <button
                  type="button"
                  className="ml-2 text-primary hover:underline"
                  onClick={() => setSlugLocked(false)}
                >
                  Edit
                </button>
              )}
            </p>
          ) : null}
        </div>
        {mode === "edit" && productId ? (
          <div className="flex flex-wrap gap-2 text-sm">
            <Link
              href={`/guardian/products/${productId}/history`}
              className="text-primary hover:underline"
            >
              History
            </Link>
            <span className="text-muted-foreground">·</span>
            <Link
              href={`/guardian/products/${productId}/activity`}
              className="text-primary hover:underline"
            >
              Activity
            </Link>
          </div>
        ) : null}
      </div>

      <form onSubmit={onSave} className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="flex flex-col gap-4">
          <div className="rounded-md border border-border bg-card p-4">
            <Label htmlFor="name" className="sr-only">
              Product name
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugLocked) setSlug(slugify(e.target.value));
              }}
              placeholder="Product name"
              className="h-11 text-lg font-medium"
              required
            />
            {mode === "create" || !slugLocked ? (
              <div className="mt-3 space-y-1">
                <Label htmlFor="slug">Slug</Label>
                <Input
                  id="slug"
                  value={slug}
                  onChange={(e) => {
                    setSlug(e.target.value);
                    setSlugLocked(true);
                  }}
                  required
                />
              </div>
            ) : null}
          </div>

          <div className="rounded-md border border-border bg-card">
            <div className="border-b border-border px-4 py-2 text-sm font-medium">
              Product description
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={8}
              className="w-full resize-y bg-transparent px-4 py-3 text-sm outline-none"
              placeholder="Write a full product description…"
            />
          </div>

          <ProductDataPanel
            dataTab={dataTab}
            onDataTabChange={setDataTab}
            productType={productType}
            onProductTypeChange={setProductType}
            mode={mode}
            product={product}
            productId={productId}
            inventoryMessage={inventoryMessage}
            regularPrice={regularPrice}
            setRegularPrice={setRegularPrice}
            salePrice={salePrice}
            setSalePrice={setSalePrice}
            variantSku={variantSku}
            setVariantSku={setVariantSku}
            isRxEligible={isRxEligible}
            setIsRxEligible={setIsRxEligible}
            isFeatured={isFeatured}
            setIsFeatured={setIsFeatured}
            gtin={gtin}
            setGtin={setGtin}
            soldIndividually={soldIndividually}
            setSoldIndividually={setSoldIndividually}
            weightLbs={weightLbs}
            setWeightLbs={setWeightLbs}
            lengthIn={lengthIn}
            setLengthIn={setLengthIn}
            widthIn={widthIn}
            setWidthIn={setWidthIn}
            heightIn={heightIn}
            setHeightIn={setHeightIn}
            shippingClass={shippingClass}
            setShippingClass={setShippingClass}
            oneTimeShipping={oneTimeShipping}
            setOneTimeShipping={setOneTimeShipping}
            catalogOptions={catalogOptions}
            upsellIds={upsellIds}
            setUpsellIds={setUpsellIds}
            crossSellIds={crossSellIds}
            setCrossSellIds={setCrossSellIds}
            bundleSellIds={bundleSellIds}
            setBundleSellIds={setBundleSellIds}
            bundleSellsTitle={bundleSellsTitle}
            setBundleSellsTitle={setBundleSellsTitle}
            bundleSellsDiscount={bundleSellsDiscount}
            setBundleSellsDiscount={setBundleSellsDiscount}
            catalogAttributes={catalogAttributes}
            setCatalogAttributes={setCatalogAttributes}
            newAttributeName={newAttributeName}
            setNewAttributeName={setNewAttributeName}
            defaultVariationOptions={defaultVariationOptions}
            setDefaultVariationOptions={setDefaultVariationOptions}
            newSku={newSku}
            setNewSku={setNewSku}
            newPrice={newPrice}
            setNewPrice={setNewPrice}
            newSalePrice={newSalePrice}
            setNewSalePrice={setNewSalePrice}
            onAddVariation={() => void onAddVariation()}
            onRemoveVariation={(id) => void onRemoveVariation(id)}
            onUpdateVariationOptions={(id, opts) =>
              void onUpdateVariationOptions(id, opts)
            }
            purchaseNote={purchaseNote}
            setPurchaseNote={setPurchaseNote}
            menuOrder={menuOrder}
            setMenuOrder={setMenuOrder}
            enableReviews={enableReviews}
            setEnableReviews={setEnableReviews}
            limitSubscription={limitSubscription}
            setLimitSubscription={setLimitSubscription}
            stripeButtonPosition={stripeButtonPosition}
            setStripeButtonPosition={setStripeButtonPosition}
            stripeGateways={stripeGateways}
            setStripeGateways={setStripeGateways}
          />

          <div className="rounded-md border border-border bg-card">
            <div className="border-b border-border px-4 py-2 text-sm font-medium">
              Product short description
            </div>
            <textarea
              value={shortDescription}
              onChange={(e) => setShortDescription(e.target.value)}
              rows={4}
              className="w-full resize-y bg-transparent px-4 py-3 text-sm outline-none"
              placeholder="Excerpt shown in listings…"
            />
          </div>

          <div className="rounded-md border border-border bg-card p-4">
            <div className="mb-3 text-sm font-medium">SEO & questionnaire</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="seoTitle">SEO title</Label>
                <Input
                  id="seoTitle"
                  value={seoTitle}
                  onChange={(e) => setSeoTitle(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="seoCanonical">Canonical URL</Label>
                <Input
                  id="seoCanonical"
                  value={seoCanonical}
                  onChange={(e) => setSeoCanonical(e.target.value)}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="seoDescription">SEO description</Label>
                <textarea
                  id="seoDescription"
                  value={seoDescription}
                  onChange={(e) => setSeoDescription(e.target.value)}
                  rows={2}
                  className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="binding">Questionnaire binding ref</Label>
                <Input
                  id="binding"
                  value={questionnaireBindingRef}
                  onChange={(e) =>
                    setQuestionnaireBindingRef(e.target.value)
                  }
                  placeholder="Required before publishing Rx products"
                />
              </div>
            </div>
          </div>
        </div>

        <aside className="flex flex-col gap-4">
          <div className="rounded-md border border-border bg-card">
            <div className="border-b border-border px-3 py-2 text-sm font-medium">
              Publish
            </div>
            <div className="space-y-2 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <span>{statusLabel}</span>
              </div>
              {error ? (
                <p className="text-xs text-destructive">{error}</p>
              ) : null}
              {message ? (
                <p className="text-xs text-emerald-600">{message}</p>
              ) : null}
              <Button type="submit" className="w-full" disabled={saving}>
                {saving
                  ? "Saving…"
                  : mode === "create"
                    ? "Create draft"
                    : "Update"}
              </Button>
              {mode === "edit" && productId ? (
                <div className="flex flex-col gap-1 pt-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void runTransition("PUBLISHED")}
                  >
                    Publish
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void runTransition("UNPUBLISHED")}
                  >
                    Move to private
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void runTransition("ARCHIVED")}
                  >
                    Move to trash
                  </Button>
                  <RequirePermission permission={Permissions.PRD_DELETE}>
                    <button
                      type="button"
                      className="pt-1 text-left text-sm text-destructive hover:underline"
                      onClick={() =>
                        void deleteProduct(productId)
                          .then(() => router.push("/guardian/products"))
                          .catch(() =>
                            setError(
                              "Delete failed. Unpublish published products first.",
                            ),
                          )
                      }
                    >
                      Delete permanently
                    </button>
                  </RequirePermission>
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-md border border-border bg-card">
            <div className="border-b border-border px-3 py-2 text-sm font-medium">
              Product image
            </div>
            <div className="space-y-2 p-3 text-sm">
              <Input
                value={featuredMediaAssetId}
                onChange={(e) => setFeaturedMediaAssetId(e.target.value)}
                placeholder="Media asset id or URL"
              />
            </div>
          </div>

          <div className="rounded-md border border-border bg-card">
            <div className="border-b border-border px-3 py-2 text-sm font-medium">
              Product gallery
            </div>
            <div className="space-y-2 p-3 text-sm">
              {product?.media.map((m) => (
                <div
                  key={m.id ?? m.mediaAssetId}
                  className="truncate text-xs text-muted-foreground"
                >
                  {m.mediaAssetId}
                </div>
              ))}
              {mode === "edit" && productId ? (
                <div className="flex gap-2">
                  <Input
                    value={galleryAssetId}
                    onChange={(e) => setGalleryAssetId(e.target.value)}
                    placeholder="Asset id"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (!galleryAssetId) return;
                      void attachMedia(productId, {
                        mediaAssetId: galleryAssetId,
                      })
                        .then(() => getAdminProduct(productId))
                        .then(hydrate)
                        .then(() => setGalleryAssetId(""))
                        .catch(() => setError("Unable to attach media."));
                    }}
                  >
                    Add
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Save product first to attach gallery images.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-md border border-border bg-card">
            <div className="border-b border-border px-3 py-2 text-sm font-medium">
              Product categories
            </div>
            <div className="max-h-48 space-y-1 overflow-y-auto p-3 text-sm">
              {categories.map((c) => (
                <label key={c.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedCategoryIds.includes(c.id)}
                    onChange={() =>
                      setSelectedCategoryIds((prev) =>
                        prev.includes(c.id)
                          ? prev.filter((x) => x !== c.id)
                          : [...prev, c.id],
                      )
                    }
                  />
                  <span style={{ paddingLeft: (c.depth ?? 0) * 12 }}>
                    {c.name}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="rounded-md border border-border bg-card">
            <div className="border-b border-border px-3 py-2 text-sm font-medium">
              Product tags
            </div>
            <div className="p-3">
              <Input
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
                placeholder="Comma-separated tags"
              />
            </div>
          </div>

          <div className="rounded-md border border-border bg-card">
            <div className="border-b border-border px-3 py-2 text-sm font-medium">
              Brands
            </div>
            <div className="space-y-2 p-3 text-sm">
              <Input
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                placeholder="Brand display name"
              />
            </div>
          </div>
        </aside>
      </form>
    </main>
  );
}
