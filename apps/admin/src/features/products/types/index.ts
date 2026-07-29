export type ProductLifecycleStatus =
  | "DRAFT"
  | "REVIEW"
  | "PUBLISHED"
  | "UNPUBLISHED"
  | "ARCHIVED";

export type ProductType =
  | "STANDARD"
  | "VARIABLE"
  | "BUNDLE"
  | "KIT"
  | "DIGITAL"
  | "SIMPLE_SUBSCRIPTION"
  | "VARIABLE_SUBSCRIPTION";

export type ProductAttributeDef = {
  name: string;
  values: string[];
  forVariation?: boolean;
  /** Per-attribute medical DIN (not a product-level field). */
  din?: string;
  /** Per-attribute dose / strength (not a product-level field). */
  dose?: string;
};

export type StripeGatewayPref = {
  id: string;
  label: string;
  enabled: boolean;
  chargeType?: "Authorize" | "Capture" | null;
  sortOrder?: number;
};

export type ProductRelationRef = {
  id: string;
  relationType: string;
  target: { id: string; name: string; slug: string };
};

export type ProductVariant = {
  id: string;
  sku: string;
  label: string | null;
  priceCents: number;
  salePriceCents: number | null;
  currency: string;
  isFulfillable: boolean;
  optionValues?: Record<string, string> | null;
};

export type ProductCategoryRef = {
  id: string;
  name: string;
  slug: string;
};

export type ProductMediaRef = {
  id?: string;
  mediaAssetId: string;
  alt: string | null;
  sortOrder: number;
};

export type Product = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  shortDescription: string | null;
  productType: ProductType;
  lifecycleStatus: ProductLifecycleStatus;
  isRxEligible: boolean;
  isFeatured: boolean;
  brandId: string | null;
  brandName: string | null;
  featuredMediaAssetId: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  seoCanonical: string | null;
  tags: string[];
  medicalInfo: Record<string, unknown> | null;
  attributes: ProductAttributeDef[] | Record<string, unknown> | null;
  questionnaireBindingRef: string | null;
  gtin: string | null;
  soldIndividually: boolean;
  weightLbs: string | number | null;
  lengthIn: string | number | null;
  widthIn: string | number | null;
  heightIn: string | number | null;
  shippingClass: string | null;
  oneTimeShipping: boolean;
  bundleSellsTitle: string | null;
  bundleSellsDiscount: string | null;
  defaultVariationOptions: Record<string, string> | null;
  purchaseNote: string | null;
  menuOrder: number;
  enableReviews: boolean;
  limitSubscription: string | null;
  stripeButtonPosition: string | null;
  stripeGateways: StripeGatewayPref[] | null;
  createdAt?: string;
  updatedAt?: string;
  variants: ProductVariant[];
  media: ProductMediaRef[];
  categoryLinks: Array<{ category: ProductCategoryRef }>;
  relationsFrom?: ProductRelationRef[];
};

export type ProductStatusCounts = {
  ALL: number;
  DRAFT: number;
  REVIEW: number;
  PUBLISHED: number;
  UNPUBLISHED: number;
  ARCHIVED: number;
};

export type ProductListResponse = {
  items: Product[];
  total: number;
  statusCounts?: ProductStatusCounts;
};

export type CreateProductPayload = {
  name: string;
  slug: string;
  description?: string;
  shortDescription?: string;
  isRxEligible?: boolean;
  isFeatured?: boolean;
  productType?: ProductType;
  brandName?: string;
  featuredMediaAssetId?: string;
  seoTitle?: string;
  seoDescription?: string;
  seoCanonical?: string;
  questionnaireBindingRef?: string;
  categoryIds?: string[];
  tags?: string[];
  medicalInfo?: Record<string, unknown>;
  attributes?: ProductAttributeDef[] | Record<string, unknown>;
  gtin?: string | null;
  soldIndividually?: boolean;
  weightLbs?: number | null;
  lengthIn?: number | null;
  widthIn?: number | null;
  heightIn?: number | null;
  shippingClass?: string | null;
  oneTimeShipping?: boolean;
  bundleSellsTitle?: string | null;
  bundleSellsDiscount?: string | null;
  defaultVariationOptions?: Record<string, string> | null;
  purchaseNote?: string | null;
  menuOrder?: number;
  enableReviews?: boolean;
  limitSubscription?: string | null;
  stripeButtonPosition?: string | null;
  stripeGateways?: StripeGatewayPref[] | null;
  upsellIds?: string[];
  crossSellIds?: string[];
  bundleSellIds?: string[];
};

export type Category = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  parent?: { id: string; name: string; slug: string } | null;
  lifecycleStatus: "DRAFT" | "PUBLISHED" | "UNPUBLISHED" | "ARCHIVED";
  seoTitle: string | null;
  seoDescription: string | null;
  sortOrder: number;
  thumbnailMediaAssetId: string | null;
  minQuantity: number | null;
  maxQuantity: number | null;
  groupOf: number | null;
  displayType: string | null;
  headerContentAlign: string | null;
  headerTextAlign: string | null;
  headerImageAssetId: string | null;
  contentPermissionRoles: string[];
  depth?: number;
  _count?: { productLinks: number; children?: number };
};

export type CategoryListResponse = {
  items: Category[];
  total: number;
};

export type CreateCategoryPayload = {
  name: string;
  slug: string;
  description?: string;
  parentId?: string | null;
  seoTitle?: string;
  seoDescription?: string;
  sortOrder?: number;
  thumbnailMediaAssetId?: string | null;
  minQuantity?: number | null;
  maxQuantity?: number | null;
  groupOf?: number | null;
  displayType?: string | null;
  headerContentAlign?: string | null;
  headerTextAlign?: string | null;
  headerImageAssetId?: string | null;
  contentPermissionRoles?: string[];
};
