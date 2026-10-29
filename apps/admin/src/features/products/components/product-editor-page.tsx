"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ModuleDetailSearch } from "@/components/patterns";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RequirePermission } from "@/components/auth/require-permission";
import { listPickerAssets, resolveAsset } from "@/features/assets/api/assets-api";
import { Permissions } from "@/features/auth/permissions";
import { listAdminCategories } from "@/features/categories/api/categories-api";
import {
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
import { cn } from "@/lib/utils";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

type ProductFormSnapshot = Record<string, string>;

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
  const [baseline, setBaseline] = useState<ProductFormSnapshot | null>(null);
  const [baselineNonce, setBaselineNonce] = useState(0);
  const [appliedBaselineNonce, setAppliedBaselineNonce] = useState(0);
  const [createBaselineReady, setCreateBaselineReady] = useState(
    mode !== "create",
  );
  const [highlightUnsaved, setHighlightUnsaved] = useState(false);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const bypassLeaveGuardRef = useRef(false);
  const leaveActionRef = useRef<"discard" | "update" | null>(null);

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
  const [resolvedPreviewUrl, setResolvedPreviewUrl] = useState<string | null>(
    null,
  );
  const [resolvedPreviewName, setResolvedPreviewName] = useState<string | null>(
    null,
  );
  const [previewResolveKey, setPreviewResolveKey] = useState("");
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
    } else {
      setPrimaryVariantId(null);
      setVariantSku("");
      setRegularPrice("");
      setSalePrice("");
    }
    setBaselineNonce((n) => n + 1);
  }, []);

  const captureSnapshot = useCallback((): ProductFormSnapshot => {
    return {
      name,
      slug,
      description,
      shortDescription,
      productType,
      isRxEligible: String(isRxEligible),
      isFeatured: String(isFeatured),
      brandName,
      tagsText,
      seoTitle,
      seoDescription,
      seoCanonical,
      featuredMediaAssetId,
      selectedCategoryIds: stableJson([...selectedCategoryIds].sort()),
      questionnaireBindingRef,
      regularPrice,
      salePrice,
      variantSku,
      gtin,
      soldIndividually: String(soldIndividually),
      weightLbs,
      lengthIn,
      widthIn,
      heightIn,
      shippingClass,
      oneTimeShipping: String(oneTimeShipping),
      upsellIds: stableJson([...upsellIds].sort()),
      crossSellIds: stableJson([...crossSellIds].sort()),
      bundleSellIds: stableJson([...bundleSellIds].sort()),
      bundleSellsTitle,
      bundleSellsDiscount,
      catalogAttributes: stableJson(catalogAttributes),
      defaultVariationOptions: stableJson(defaultVariationOptions),
      purchaseNote,
      menuOrder,
      enableReviews: String(enableReviews),
      limitSubscription,
      stripeButtonPosition,
      stripeGateways: stableJson(stripeGateways),
    };
  }, [
    name,
    slug,
    description,
    shortDescription,
    productType,
    isRxEligible,
    isFeatured,
    brandName,
    tagsText,
    seoTitle,
    seoDescription,
    seoCanonical,
    featuredMediaAssetId,
    selectedCategoryIds,
    questionnaireBindingRef,
    regularPrice,
    salePrice,
    variantSku,
    gtin,
    soldIndividually,
    weightLbs,
    lengthIn,
    widthIn,
    heightIn,
    shippingClass,
    oneTimeShipping,
    upsellIds,
    crossSellIds,
    bundleSellIds,
    bundleSellsTitle,
    bundleSellsDiscount,
    catalogAttributes,
    defaultVariationOptions,
    purchaseNote,
    menuOrder,
    enableReviews,
    limitSubscription,
    stripeButtonPosition,
    stripeGateways,
  ]);

  const currentSnapshot = useMemo(
    () => captureSnapshot(),
    [captureSnapshot],
  );

  const dirtyFields = useMemo(() => {
    const dirty = new Set<string>();
    if (!baseline) return dirty;
    for (const key of Object.keys(currentSnapshot)) {
      if (currentSnapshot[key] !== baseline[key]) dirty.add(key);
    }
    return dirty;
  }, [baseline, currentSnapshot]);

  const isDirty = dirtyFields.size > 0;

  const isFieldUnsaved = useCallback(
    (key: string) => highlightUnsaved && dirtyFields.has(key),
    [highlightUnsaved, dirtyFields],
  );

  // Establish create-mode baseline / re-baseline after hydrate+save during render
  // (React “adjust state when a prop/state changes” pattern — avoids set-state-in-effect).
  if (mode === "create" && !createBaselineReady) {
    setCreateBaselineReady(true);
    setBaseline(captureSnapshot());
    if (highlightUnsaved) setHighlightUnsaved(false);
  }
  if (baselineNonce !== appliedBaselineNonce) {
    setAppliedBaselineNonce(baselineNonce);
    setBaseline(captureSnapshot());
    if (highlightUnsaved) setHighlightUnsaved(false);
  }

  const featuredMediaTrimmed = featuredMediaAssetId.trim();
  const featuredIsHttp =
    featuredMediaTrimmed.startsWith("http://") ||
    featuredMediaTrimmed.startsWith("https://");
  if (previewResolveKey !== featuredMediaTrimmed) {
    setPreviewResolveKey(featuredMediaTrimmed);
    setResolvedPreviewUrl(null);
    setResolvedPreviewName(null);
  }
  const featuredPreviewUrl = featuredIsHttp
    ? featuredMediaTrimmed
    : featuredMediaTrimmed
      ? resolvedPreviewUrl
      : null;
  const featuredPreviewName =
    featuredIsHttp || !featuredMediaTrimmed ? null : resolvedPreviewName;

  useEffect(() => {
    if (!leaveDialogOpen) return;
    const scroller = document.querySelector<HTMLElement>("[data-admin-scroll]");
    if (!scroller) return;
    const previous = scroller.style.overflow;
    scroller.style.overflow = "hidden";
    return () => {
      scroller.style.overflow = previous;
    };
  }, [leaveDialogOpen]);

  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

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

  useEffect(() => {
    if (!featuredMediaTrimmed || featuredIsHttp) return;
    let cancelled = false;
    void resolveAsset(featuredMediaTrimmed)
      .then((r) => {
        if (cancelled) return;
        setResolvedPreviewUrl(r.url);
        setResolvedPreviewName(r.altText);
      })
      .catch(() => {
        if (cancelled) return;
        setResolvedPreviewUrl(null);
        setResolvedPreviewName(null);
      });
    return () => {
      cancelled = true;
    };
  }, [featuredMediaTrimmed, featuredIsHttp]);

  const searchFeaturedAssets = useCallback(async (q: string) => {
    const res = await listPickerAssets({ q, take: 20 });
    return res.items.map((asset) => ({
      id: asset.id,
      label: asset.originalFilename,
      sublabel: `${asset.mimeType} · ${asset.status}`,
    }));
  }, []);

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

  async function persistProduct(): Promise<boolean> {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const payload = buildPayload();
      if (mode === "create") {
        const created = await createProduct(payload);
        await syncPrimaryPricing(created.id);
        bypassLeaveGuardRef.current = true;
        setHighlightUnsaved(false);
        router.push(`/guardian/products/${created.id}/edit`);
        return true;
      }
      if (!productId) return false;
      await updateProduct(productId, payload);
      await syncPrimaryPricing(productId);
      const refreshed = await getAdminProduct(productId);
      hydrate(refreshed);
      setMessage("Product updated.");
      setHighlightUnsaved(false);
      return true;
    } catch {
      setError(
        "Unable to save product. Check required fields and slug uniqueness.",
      );
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function onSave(event: React.FormEvent) {
    event.preventDefault();
    await persistProduct();
  }

  function requestLeave(href: string) {
    if (bypassLeaveGuardRef.current || !isDirty) {
      router.push(href);
      return;
    }
    setPendingHref(href);
    setLeaveDialogOpen(true);
  }

  function onLeaveDiscard() {
    const href = pendingHref ?? "/guardian/products";
    leaveActionRef.current = "discard";
    setLeaveDialogOpen(false);
    setPendingHref(null);
    setHighlightUnsaved(false);
    bypassLeaveGuardRef.current = true;
    router.push(href);
  }

  async function onLeaveUpdate() {
    const href = pendingHref ?? "/guardian/products";
    const ok = await persistProduct();
    if (!ok) return;
    leaveActionRef.current = "update";
    setLeaveDialogOpen(false);
    setPendingHref(null);
    bypassLeaveGuardRef.current = true;
    router.push(href);
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
          <button
            type="button"
            onClick={() => requestLeave("/guardian/products")}
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            ← All products
          </button>
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
            <button
              type="button"
              onClick={() =>
                requestLeave(`/guardian/products/${productId}/history`)
              }
              className="text-primary hover:underline"
            >
              History
            </button>
            <span className="text-muted-foreground">·</span>
            <button
              type="button"
              onClick={() =>
                requestLeave(`/guardian/products/${productId}/activity`)
              }
              className="text-primary hover:underline"
            >
              Activity
            </button>
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
              aria-invalid={isFieldUnsaved("name")}
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
                  aria-invalid={isFieldUnsaved("slug")}
                />
              </div>
            ) : null}
          </div>

          <div
            className={cn(
              "rounded-md border bg-card",
              isFieldUnsaved("description")
                ? "border-destructive ring-1 ring-destructive/30"
                : "border-border",
            )}
          >
            <div className="border-b border-border px-4 py-2 text-sm font-medium">
              Product description
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={8}
              className="w-full resize-y bg-transparent px-4 py-3 text-sm outline-none"
              placeholder="Write a full product description…"
              aria-invalid={isFieldUnsaved("description")}
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
            isFieldUnsaved={isFieldUnsaved}
          />

          <div
            className={cn(
              "rounded-md border bg-card",
              isFieldUnsaved("shortDescription")
                ? "border-destructive ring-1 ring-destructive/30"
                : "border-border",
            )}
          >
            <div className="border-b border-border px-4 py-2 text-sm font-medium">
              Product short description
            </div>
            <textarea
              value={shortDescription}
              onChange={(e) => setShortDescription(e.target.value)}
              rows={4}
              className="w-full resize-y bg-transparent px-4 py-3 text-sm outline-none"
              placeholder="Excerpt shown in listings…"
              aria-invalid={isFieldUnsaved("shortDescription")}
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
                  aria-invalid={isFieldUnsaved("seoTitle")}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="seoCanonical">Canonical URL</Label>
                <Input
                  id="seoCanonical"
                  value={seoCanonical}
                  onChange={(e) => setSeoCanonical(e.target.value)}
                  aria-invalid={isFieldUnsaved("seoCanonical")}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="seoDescription">SEO description</Label>
                <textarea
                  id="seoDescription"
                  value={seoDescription}
                  onChange={(e) => setSeoDescription(e.target.value)}
                  rows={2}
                  className={cn(
                    "w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none",
                    isFieldUnsaved("seoDescription")
                      ? "border-destructive ring-3 ring-destructive/20"
                      : "border-border",
                  )}
                  aria-invalid={isFieldUnsaved("seoDescription")}
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
                  aria-invalid={isFieldUnsaved("questionnaireBindingRef")}
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

          <div
            className={cn(
              "rounded-md border bg-card",
              isFieldUnsaved("featuredMediaAssetId")
                ? "border-destructive ring-1 ring-destructive/30"
                : "border-border",
            )}
          >
            <div className="border-b border-border px-3 py-2 text-sm font-medium">
              Product image
            </div>
            <div className="space-y-3 p-3 text-sm">
              <div className="space-y-1.5">
                <Label htmlFor="product-image-search">Search by name</Label>
                <ModuleDetailSearch
                  searchFn={searchFeaturedAssets}
                  onSelect={(id) => {
                    setFeaturedMediaAssetId(id);
                    setMessage("Featured image selected from Media Vault. Save the product to apply.");
                  }}
                  placeholder="Search Media Vault by filename…"
                  minQueryLength={1}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="product-image-id">Media asset id or URL</Label>
                <Input
                  id="product-image-id"
                  value={featuredMediaAssetId}
                  onChange={(e) => setFeaturedMediaAssetId(e.target.value)}
                  placeholder="Paste asset id or image URL"
                  aria-invalid={isFieldUnsaved("featuredMediaAssetId")}
                />
              </div>
              {featuredPreviewUrl ? (
                <div className="flex min-h-48 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/30 sm:min-h-56">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={featuredPreviewUrl}
                    alt={featuredPreviewName || "Product image preview"}
                    className="mx-auto max-h-64 w-full object-contain p-3 sm:max-h-72"
                  />
                </div>
              ) : featuredMediaAssetId.trim() ? (
                <p className="text-xs text-muted-foreground">
                  Preview unavailable — save with an Active Media Vault asset id
                  for a thumbnail.
                </p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                Selecting from search stores the Media Vault asset id. Click Save
                on the product to persist it.
              </p>
            </div>
          </div>

          <div
            className={cn(
              "rounded-md border bg-card",
              isFieldUnsaved("selectedCategoryIds")
                ? "border-destructive ring-1 ring-destructive/30"
                : "border-border",
            )}
          >
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
                aria-invalid={isFieldUnsaved("tagsText")}
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
                aria-invalid={isFieldUnsaved("brandName")}
              />
            </div>
          </div>
        </aside>
      </form>

      <Dialog
        open={leaveDialogOpen}
        onOpenChange={(open) => {
          if (open) {
            setLeaveDialogOpen(true);
            return;
          }
          setLeaveDialogOpen(false);
          setPendingHref(null);
          if (leaveActionRef.current) {
            leaveActionRef.current = null;
            return;
          }
          setHighlightUnsaved(true);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Unsaved changes</DialogTitle>
            <DialogDescription>
              You have unsaved changes on this product. Update to keep them, or
              discard to leave without saving.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={onLeaveDiscard}
              disabled={saving}
            >
              Discard
            </Button>
            <Button
              type="button"
              onClick={() => void onLeaveUpdate()}
              disabled={saving}
              loading={saving}
            >
              Update
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
