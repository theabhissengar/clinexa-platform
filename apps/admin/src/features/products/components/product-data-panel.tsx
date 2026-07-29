"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  Product,
  ProductAttributeDef,
  ProductType,
  StripeGatewayPref,
} from "@/features/products/types";
import {
  DEFAULT_STRIPE_GATEWAYS,
  PRODUCT_TYPE_OPTIONS,
  decimalToInput,
} from "@/features/products/lib/product-data-defaults";

export type DataTab =
  | "general"
  | "inventory"
  | "shipping"
  | "linked"
  | "attributes"
  | "variations"
  | "advanced"
  | "stripe";

const DATA_TABS: Array<{ id: DataTab; label: string }> = [
  { id: "general", label: "General" },
  { id: "inventory", label: "Inventory" },
  { id: "shipping", label: "Shipping" },
  { id: "linked", label: "Linked Products" },
  { id: "attributes", label: "Attributes" },
  { id: "variations", label: "Variations" },
  { id: "advanced", label: "Advanced" },
  { id: "stripe", label: "Stripe Settings" },
];

type LinkedOption = { id: string; name: string };

type Props = {
  dataTab: DataTab;
  onDataTabChange: (tab: DataTab) => void;
  productType: ProductType;
  onProductTypeChange: (value: ProductType) => void;
  mode: "create" | "edit";
  product: Product | null;
  productId?: string;
  inventoryMessage: string | null;
  // general
  regularPrice: string;
  setRegularPrice: (v: string) => void;
  salePrice: string;
  setSalePrice: (v: string) => void;
  variantSku: string;
  setVariantSku: (v: string) => void;
  isRxEligible: boolean;
  setIsRxEligible: (v: boolean) => void;
  isFeatured: boolean;
  setIsFeatured: (v: boolean) => void;
  // inventory
  gtin: string;
  setGtin: (v: string) => void;
  soldIndividually: boolean;
  setSoldIndividually: (v: boolean) => void;
  // shipping
  weightLbs: string;
  setWeightLbs: (v: string) => void;
  lengthIn: string;
  setLengthIn: (v: string) => void;
  widthIn: string;
  setWidthIn: (v: string) => void;
  heightIn: string;
  setHeightIn: (v: string) => void;
  shippingClass: string;
  setShippingClass: (v: string) => void;
  oneTimeShipping: boolean;
  setOneTimeShipping: (v: boolean) => void;
  // linked
  catalogOptions: LinkedOption[];
  upsellIds: string[];
  setUpsellIds: (v: string[]) => void;
  crossSellIds: string[];
  setCrossSellIds: (v: string[]) => void;
  bundleSellIds: string[];
  setBundleSellIds: (v: string[]) => void;
  bundleSellsTitle: string;
  setBundleSellsTitle: (v: string) => void;
  bundleSellsDiscount: string;
  setBundleSellsDiscount: (v: string) => void;
  // attributes
  catalogAttributes: ProductAttributeDef[];
  setCatalogAttributes: (v: ProductAttributeDef[]) => void;
  newAttributeName: string;
  setNewAttributeName: (v: string) => void;
  // variations
  defaultVariationOptions: Record<string, string>;
  setDefaultVariationOptions: (v: Record<string, string>) => void;
  newSku: string;
  setNewSku: (v: string) => void;
  newPrice: string;
  setNewPrice: (v: string) => void;
  newSalePrice: string;
  setNewSalePrice: (v: string) => void;
  onAddVariation: () => void;
  onRemoveVariation: (variantId: string) => void;
  onUpdateVariationOptions: (
    variantId: string,
    optionValues: Record<string, string>,
  ) => void;
  // advanced
  purchaseNote: string;
  setPurchaseNote: (v: string) => void;
  menuOrder: string;
  setMenuOrder: (v: string) => void;
  enableReviews: boolean;
  setEnableReviews: (v: boolean) => void;
  limitSubscription: string;
  setLimitSubscription: (v: string) => void;
  // stripe
  stripeButtonPosition: string;
  setStripeButtonPosition: (v: string) => void;
  stripeGateways: StripeGatewayPref[];
  setStripeGateways: (v: StripeGatewayPref[]) => void;
};

function MultiProductPicker({
  label,
  help,
  options,
  selectedIds,
  onChange,
  excludeId,
}: {
  label: string;
  help?: string;
  options: LinkedOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  excludeId?: string;
}) {
  const available = options.filter((o) => o.id !== excludeId);
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <select
        className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
        value=""
        onChange={(e) => {
          const id = e.target.value;
          if (!id || selectedIds.includes(id)) return;
          onChange([...selectedIds, id]);
        }}
      >
        <option value="">Search for a product…</option>
        {available.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      {selectedIds.length ? (
        <ul className="space-y-1 pt-1">
          {selectedIds.map((id) => {
            const item = options.find((o) => o.id === id);
            return (
              <li
                key={id}
                className="flex items-center justify-between rounded border border-border px-2 py-1 text-xs"
              >
                <span>{item?.name ?? id}</span>
                <button
                  type="button"
                  className="text-destructive hover:underline"
                  onClick={() => onChange(selectedIds.filter((x) => x !== id))}
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {help ? <p className="text-xs text-muted-foreground">{help}</p> : null}
    </div>
  );
}

export function ProductDataPanel(props: Props) {
  const {
    dataTab,
    onDataTabChange,
    productType,
    onProductTypeChange,
    mode,
    product,
    productId,
    inventoryMessage,
  } = props;

  function moveGateway(index: number, direction: -1 | 1) {
    const next = [...props.stripeGateways];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    const tmp = next[index];
    next[index] = next[target];
    next[target] = tmp;
    props.setStripeGateways(
      next.map((row, sortOrder) => ({ ...row, sortOrder })),
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span>Product data</span>
          <select
            className="h-8 rounded border border-border bg-background px-2 text-sm font-normal"
            value={productType}
            onChange={(e) =>
              onProductTypeChange(e.target.value as ProductType)
            }
          >
            {PRODUCT_TYPE_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid md:grid-cols-[180px_1fr]">
        <nav className="border-b border-border md:border-b-0 md:border-r">
          {DATA_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onDataTabChange(tab.id)}
              className={`block w-full border-l-2 px-3 py-2.5 text-left text-sm ${
                dataTab === tab.id
                  ? "border-l-primary bg-muted/40 font-medium"
                  : "border-l-transparent text-muted-foreground hover:bg-muted/20"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        <div className="space-y-4 p-4 text-sm">
          {dataTab === "general" ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="regularPrice">Regular price ($)</Label>
                  <Input
                    id="regularPrice"
                    value={props.regularPrice}
                    onChange={(e) => props.setRegularPrice(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="salePrice">Sale price ($)</Label>
                  <Input
                    id="salePrice"
                    value={props.salePrice}
                    onChange={(e) => props.setSalePrice(e.target.value)}
                    placeholder="Optional"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="variantSku">Primary SKU</Label>
                <Input
                  id="variantSku"
                  value={props.variantSku}
                  onChange={(e) => props.setVariantSku(e.target.value)}
                />
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={props.isRxEligible}
                  onChange={(e) => props.setIsRxEligible(e.target.checked)}
                />
                Rx-eligible
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={props.isFeatured}
                  onChange={(e) => props.setIsFeatured(e.target.checked)}
                />
                Featured product
              </label>
            </>
          ) : null}

          {dataTab === "inventory" ? (
            <div className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="invSku">SKU</Label>
                <Input
                  id="invSku"
                  value={props.variantSku}
                  onChange={(e) => props.setVariantSku(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="gtin">GTIN, UPC, EAN, or ISBN</Label>
                <Input
                  id="gtin"
                  value={props.gtin}
                  onChange={(e) => props.setGtin(e.target.value)}
                />
              </div>
              <div className="rounded border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                Settings below apply to all variations without manual stock
                management enabled. Stock balances are owned by the Inventory
                module.
              </div>
              <div>
                <div className="font-medium">Stock management</div>
                <p className="text-muted-foreground">
                  {inventoryMessage ??
                    "Disabled until the Inventory module ships. Catalog stores SKU/GTIN only."}
                </p>
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={props.soldIndividually}
                  onChange={(e) =>
                    props.setSoldIndividually(e.target.checked)
                  }
                />
                Sold individually — Limit purchases to 1 item per order
              </label>
            </div>
          ) : null}

          {dataTab === "shipping" ? (
            <div className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="weightLbs">Weight (lbs)</Label>
                <Input
                  id="weightLbs"
                  value={props.weightLbs}
                  onChange={(e) => props.setWeightLbs(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div>
                <Label>Dimensions (in)</Label>
                <div className="mt-1 grid gap-2 sm:grid-cols-3">
                  <Input
                    placeholder="Length"
                    value={props.lengthIn}
                    onChange={(e) => props.setLengthIn(e.target.value)}
                  />
                  <Input
                    placeholder="Width"
                    value={props.widthIn}
                    onChange={(e) => props.setWidthIn(e.target.value)}
                  />
                  <Input
                    placeholder="Height"
                    value={props.heightIn}
                    onChange={(e) => props.setHeightIn(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="shippingClass">Shipping class</Label>
                <select
                  id="shippingClass"
                  className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                  value={props.shippingClass}
                  onChange={(e) => props.setShippingClass(e.target.value)}
                >
                  <option value="">No shipping class</option>
                  <option value="standard">Standard</option>
                  <option value="fragile">Fragile</option>
                  <option value="cold-chain">Cold chain</option>
                  <option value="rx">Rx restricted</option>
                </select>
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={props.oneTimeShipping}
                  onChange={(e) => props.setOneTimeShipping(e.target.checked)}
                />
                One time shipping
              </label>
            </div>
          ) : null}

          {dataTab === "linked" ? (
            <div className="space-y-4">
              <MultiProductPicker
                label="Upsells"
                options={props.catalogOptions}
                selectedIds={props.upsellIds}
                onChange={props.setUpsellIds}
                excludeId={productId}
              />
              <MultiProductPicker
                label="Cross-sells"
                options={props.catalogOptions}
                selectedIds={props.crossSellIds}
                onChange={props.setCrossSellIds}
                excludeId={productId}
              />
              <MultiProductPicker
                label="Bundle-sells"
                help="Supported product types: Simple, Simple subscription."
                options={props.catalogOptions}
                selectedIds={props.bundleSellIds}
                onChange={props.setBundleSellIds}
                excludeId={productId}
              />
              <div className="space-y-1">
                <Label htmlFor="bundleTitle">Bundle-sells title</Label>
                <Input
                  id="bundleTitle"
                  value={props.bundleSellsTitle}
                  onChange={(e) => props.setBundleSellsTitle(e.target.value)}
                  placeholder='e.g. "Frequently Bought Together"'
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="bundleDiscount">Bundle-sells discount</Label>
                <Input
                  id="bundleDiscount"
                  value={props.bundleSellsDiscount}
                  onChange={(e) =>
                    props.setBundleSellsDiscount(e.target.value)
                  }
                  placeholder="e.g. 10%"
                />
              </div>
            </div>
          ) : null}

          {dataTab === "attributes" ? (
            <div className="space-y-3">
              <p className="text-muted-foreground">
                Enter an attribute name and click Add new. Every attribute
                includes Values, DIN, Dose / Strength, and variation settings.
              </p>
              <div className="flex flex-wrap gap-2">
                <Input
                  value={props.newAttributeName}
                  onChange={(e) => props.setNewAttributeName(e.target.value)}
                  placeholder="Attribute name"
                  className="max-w-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const name = props.newAttributeName.trim();
                    if (!name) return;
                    if (
                      props.catalogAttributes.some(
                        (a) => a.name.toLowerCase() === name.toLowerCase(),
                      )
                    )
                      return;
                    props.setCatalogAttributes([
                      ...props.catalogAttributes,
                      { name, values: [], forVariation: true, din: "", dose: "" },
                    ]);
                    props.setNewAttributeName("");
                  }}
                >
                  Add new
                </Button>
              </div>
              <div className="space-y-2">
                {props.catalogAttributes.map((attr, index) => (
                  <div
                    key={`${attr.name}-${index}`}
                    className="rounded border border-border p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium">{attr.name}</div>
                      <button
                        type="button"
                        className="text-destructive hover:underline"
                        onClick={() =>
                          props.setCatalogAttributes(
                            props.catalogAttributes.filter((_, i) => i !== index),
                          )
                        }
                      >
                        Remove
                      </button>
                    </div>
                    <div className="mt-2 space-y-1">
                      <Label>Values (pipe or comma separated)</Label>
                      <Input
                        value={attr.values.join(" | ")}
                        onChange={(e) => {
                          const values = e.target.value
                            .split(/[|,]/)
                            .map((v) => v.trim())
                            .filter(Boolean);
                          const next = [...props.catalogAttributes];
                          next[index] = { ...attr, values };
                          props.setCatalogAttributes(next);
                        }}
                        placeholder="e.g. Monthly Supply | Quarterly"
                      />
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label>DIN</Label>
                        <Input
                          value={attr.din ?? ""}
                          onChange={(e) => {
                            const next = [...props.catalogAttributes];
                            next[index] = { ...attr, din: e.target.value };
                            props.setCatalogAttributes(next);
                          }}
                          placeholder="Drug Identification Number"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Dose / Strength</Label>
                        <Input
                          value={attr.dose ?? ""}
                          onChange={(e) => {
                            const next = [...props.catalogAttributes];
                            next[index] = { ...attr, dose: e.target.value };
                            props.setCatalogAttributes(next);
                          }}
                          placeholder="e.g. 500 mg"
                        />
                      </div>
                    </div>
                    <label className="mt-2 flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={Boolean(attr.forVariation)}
                        onChange={(e) => {
                          const next = [...props.catalogAttributes];
                          next[index] = {
                            ...attr,
                            forVariation: e.target.checked,
                          };
                          props.setCatalogAttributes(next);
                        }}
                      />
                      Used for variations
                    </label>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {dataTab === "variations" ? (
            <div className="space-y-4">
              <div>
                <div className="mb-2 font-medium">Default form values</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {props.catalogAttributes
                    .filter((a) => a.forVariation !== false)
                    .map((attr) => (
                      <div key={attr.name} className="space-y-1">
                        <Label>{attr.name}</Label>
                        <select
                          className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                          value={
                            props.defaultVariationOptions[attr.name] ?? ""
                          }
                          onChange={(e) =>
                            props.setDefaultVariationOptions({
                              ...props.defaultVariationOptions,
                              [attr.name]: e.target.value,
                            })
                          }
                        >
                          <option value="">No default {attr.name}…</option>
                          {attr.values.map((v) => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  {!props.catalogAttributes.length ? (
                    <p className="text-muted-foreground sm:col-span-2">
                      Add attributes first to configure default variation values.
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={mode !== "edit" || !productId}
                  onClick={props.onAddVariation}
                >
                  Add manually
                </Button>
                <span className="text-xs text-muted-foreground">
                  {product?.variants.length ?? 0} variation
                  {(product?.variants.length ?? 0) === 1 ? "" : "s"}
                </span>
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                <Input
                  placeholder="New SKU"
                  value={props.newSku}
                  onChange={(e) => props.setNewSku(e.target.value)}
                />
                <Input
                  placeholder="Price"
                  value={props.newPrice}
                  onChange={(e) => props.setNewPrice(e.target.value)}
                />
                <Input
                  placeholder="Sale price"
                  value={props.newSalePrice}
                  onChange={(e) => props.setNewSalePrice(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                {product?.variants.map((v) => {
                  const options =
                    (v.optionValues as Record<string, string> | null) ?? {};
                  return (
                    <div
                      key={v.id}
                      className="rounded border border-border p-3"
                    >
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <div className="font-mono text-xs text-muted-foreground">
                          #{v.id.slice(0, 8)} · {v.sku} · $
                          {(v.priceCents / 100).toFixed(2)}
                          {v.salePriceCents != null
                            ? ` → $${(v.salePriceCents / 100).toFixed(2)}`
                            : ""}
                        </div>
                        <button
                          type="button"
                          className="text-destructive hover:underline"
                          onClick={() => props.onRemoveVariation(v.id)}
                        >
                          Remove
                        </button>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {props.catalogAttributes
                          .filter((a) => a.forVariation !== false)
                          .map((attr) => (
                            <select
                              key={attr.name}
                              className="h-8 rounded-md border border-border bg-background px-2 text-sm"
                              value={options[attr.name] ?? ""}
                              onChange={(e) =>
                                props.onUpdateVariationOptions(v.id, {
                                  ...options,
                                  [attr.name]: e.target.value,
                                })
                              }
                            >
                              <option value="">N/A</option>
                              {attr.values.map((val) => (
                                <option key={val} value={val}>
                                  {val}
                                </option>
                              ))}
                            </select>
                          ))}
                      </div>
                    </div>
                  );
                })}
                {mode === "create" ? (
                  <p className="text-muted-foreground">
                    Save the product first to manage variations.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          {dataTab === "advanced" ? (
            <div className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="purchaseNote">Purchase note</Label>
                <textarea
                  id="purchaseNote"
                  value={props.purchaseNote}
                  onChange={(e) => props.setPurchaseNote(e.target.value)}
                  rows={4}
                  className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm"
                  placeholder="Optional note to the customer after purchase"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="menuOrder">Menu order</Label>
                <Input
                  id="menuOrder"
                  value={props.menuOrder}
                  onChange={(e) => props.setMenuOrder(e.target.value)}
                />
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={props.enableReviews}
                  onChange={(e) => props.setEnableReviews(e.target.checked)}
                />
                Enable reviews
              </label>
              <div className="space-y-1">
                <Label htmlFor="limitSubscription">Limit subscription</Label>
                <select
                  id="limitSubscription"
                  className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                  value={props.limitSubscription}
                  onChange={(e) => props.setLimitSubscription(e.target.value)}
                >
                  <option value="none">Do not limit</option>
                  <option value="one">
                    Only allow one active subscription per customer
                  </option>
                </select>
                <p className="text-xs text-muted-foreground">
                  Only allow a customer to have one subscription to this product.
                  Enforced when Subscriptions module consumes this flag.
                </p>
              </div>
              <div className="space-y-1 border-t border-border pt-3">
                <Label htmlFor="seoTitleAdv">SEO title</Label>
                <Input
                  id="seoTitleAdv"
                  value={
                    (product?.seoTitle as string | undefined) ??
                    undefined
                  }
                  disabled
                  placeholder="Use Advanced fields below via main SEO inputs — kept on Update"
                  className="hidden"
                />
              </div>
            </div>
          ) : null}

          {dataTab === "stripe" ? (
            <div className="space-y-4">
              <p className="text-muted-foreground">
                Control which gateways are displayed on the product page.
                Capture/authorize execution remains owned by Payments.
              </p>
              <div className="overflow-x-auto rounded border border-border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr>
                      <th className="w-20 px-2 py-2">Order</th>
                      <th className="px-2 py-2">Method</th>
                      <th className="px-2 py-2">Enabled</th>
                      <th className="px-2 py-2">Charge type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(props.stripeGateways.length
                      ? props.stripeGateways
                      : DEFAULT_STRIPE_GATEWAYS
                    ).map((gateway, index) => (
                      <tr key={gateway.id} className="border-t border-border">
                        <td className="px-2 py-2">
                          <div className="flex gap-1">
                            <button
                              type="button"
                              className="px-1"
                              onClick={() => moveGateway(index, -1)}
                              aria-label="Move up"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              className="px-1"
                              onClick={() => moveGateway(index, 1)}
                              aria-label="Move down"
                            >
                              ↓
                            </button>
                          </div>
                        </td>
                        <td className="px-2 py-2">{gateway.label}</td>
                        <td className="px-2 py-2">
                          <input
                            type="checkbox"
                            checked={gateway.enabled}
                            onChange={(e) => {
                              const next = [...props.stripeGateways];
                              next[index] = {
                                ...gateway,
                                enabled: e.target.checked,
                              };
                              props.setStripeGateways(next);
                            }}
                          />
                        </td>
                        <td className="px-2 py-2">
                          {gateway.id === "payment_request" ||
                          gateway.id === "apple_pay" ||
                          gateway.id === "google_pay" ||
                          gateway.id === "link" ? (
                            <select
                              className="h-8 rounded border border-border bg-background px-2 text-sm"
                              value={gateway.chargeType ?? "Capture"}
                              onChange={(e) => {
                                const next = [...props.stripeGateways];
                                next[index] = {
                                  ...gateway,
                                  chargeType: e.target.value as
                                    | "Authorize"
                                    | "Capture",
                                };
                                props.setStripeGateways(next);
                              }}
                            >
                              <option value="Authorize">Authorize</option>
                              <option value="Capture">Capture</option>
                            </select>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="space-y-1">
                <Label htmlFor="stripeButtonPosition">Button position</Label>
                <select
                  id="stripeButtonPosition"
                  className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                  value={props.stripeButtonPosition}
                  onChange={(e) =>
                    props.setStripeButtonPosition(e.target.value)
                  }
                >
                  <option value="below_add_to_cart">Below add to cart</option>
                  <option value="above_add_to_cart">Above add to cart</option>
                  <option value="replace_add_to_cart">Replace add to cart</option>
                </select>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export { DATA_TABS, decimalToInput };
