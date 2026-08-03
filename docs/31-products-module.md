# 31 — Products Module

| Field | Value |
| --- | --- |
| Document | Products Module — Platform blueprint instance |
| Product | Clinexa |
| Version | 1.5 |
| Status | In delivery (P8) |
| Audience | Architects, backend, frontend, QA, product |
| Source of truth | [00 — Product Requirements Document](00-product-requirements-document.md) |
| Related docs | [03](03-functional-requirements.md), [08](08-role-permissions.md), [10](10-database-design.md), [11](11-api-design.md), [25](25-guardian.md), [26](26-implementation-tracker.md), [27](27-module-registry.md), [28](28-ownership-matrix.md), [29](29-navigation-blueprint.md), [33](33-asset-library-module.md) |

This document is the durable **Module Blueprint** instance for Products (`GRD-031`) and sibling Categories (`GRD-032`). It follows [27 §6](27-module-registry.md#6-module-blueprint).

---

## 1. Purpose

Products is the **catalog master-data platform module**. It owns sellable offerings (identity, variants/SKUs, pricing base, media associations, SEO, Rx-eligibility, lifecycle) so Store, Checkout, Orders, Subscriptions, Search, Marketing, and future clients consume one truth.

**Requirements:** `FR-PRD-001`–`005`, `FR-CAT-001`–`004`, `OR-14`, `AC-BR-05`/`06`, `BO-5`, `ROAD-004`.

**Not its job:** Inventory stock management, Asset Library upload infrastructure, Order lifecycle, questionnaire authoring, Store presentation/UX, Patient Portal UX, payments.

### 1.1 Products vs Inventory

| Owns | Products | Inventory |
| --- | --- | --- |
| Catalog identity, variants, prices, Rx, SEO, lifecycle | Yes | No |
| Stock, reservations, availability, movements, warehouses | No | Yes |
| Read-only stock summary on product record | May display via **Inventory services only** | Source of truth (ledger + projection) |
| Writes to inventory tables | **Never** | Inventory services only |

Digital products, services, and memberships may disable inventory tracking per product type ([34](34-inventory-module.md) §14). Sibling Inventory module: **P12** ([34](34-inventory-module.md)).

### 1.2 Products vs Asset Library

| Owns | Products | Asset Library |
| --- | --- | --- |
| Upload / object storage / library organization | No | Yes |
| `featuredAssetId`, gallery associations (`DB-013`), sort/alt on product | Yes | No |
| Storage-provider URLs or raw keys | Never | Resolves via Asset Library |

Asset Library does **not** understand Products domain rules. Products store opaque Asset identifiers only ([33](33-asset-library-module.md)).

### 1.3 Products vs Store

Products exposes **structured catalog data**. Store owns homepage layout, navigation, listing UI, PDP chrome, and customer experience.

---

## 2. Owner, context, consumers

| Field | Value |
| --- | --- |
| Owner | Backend Platform Module (`ARCH-160`/`161`) |
| Application context | Guardian only for administration |
| Consumers | `GRD`, `STO`, `SYS`; later `MOB`, `API` |
| CRM | Operational read references only — no catalog CRUD |

---

## 3. Navigation (Guardian Commerce)

```text
Commerce
├── Products
├── Categories
├── Inventory          (sibling — P12; [34](34-inventory-module.md))
├── Pricing…           (sibling — later)
├── Orders
└── Subscriptions
```

Product record is a **single editor** (create and edit share the same layout): title/permalink, description, Product data tabs (General, Inventory stub, Shipping, Linked, Attributes with per-attribute DIN/Dose, Variations, Advanced/SEO), short description, and sidebar Publish / Image / Gallery / Categories / Tags / Brands.

List UX mirrors catalog-admin patterns: status tabs, search, bulk actions, category/type/brand filters (applied only on **Filter** / **Search** click), URL query persistence, hover row actions (Edit | Quick Edit | Trash | View | Duplicate), featured toggle, full UUID **ID** column, bottom pagination bar (`‹` · `N items` · `›`).

Category list is hierarchical (parent/child indentation) with image, full UUID ID, slug, product count, min/max/group-of columns. Category create/edit includes merchandising fields, header options, and Content Permissions (role allowlist; memberships deferred). List search/page state is URL-backed.

---

## 4. Pages (V1)

| Page | Route | Permission |
| --- | --- | --- |
| List | `/guardian/products` (+ query: `status`, `q`, `categoryId`, `productType`, `brand`, `page`) | `PERM-PRD-002` |
| Create | `/guardian/products/new` | `PERM-PRD-002` |
| Editor | `/guardian/products/:id/edit` (canonical); `/guardian/products/:id` redirects here | `PERM-PRD-002` |
| History / Activity | `/guardian/products/:id/history`, `…/activity` | `PERM-PRD-002` |
| Delete | action | `PERM-PRD-010` (Class D) |
| Categories list | `/guardian/categories` (+ query: `q`, `page`) | `PERM-CAT-002` |
| Category create | `/guardian/categories/new` | `PERM-CAT-002` |
| Category editor | `/guardian/categories/:id/edit` (canonical); `/guardian/categories/:id` redirects here | `PERM-CAT-002` |
| Category delete | action | `PERM-CAT-010` (Class D) |

**Stable IDs:** Products and Categories use UUID primary keys in paths and list/editor UI so Guardian, CRM, and other clients can deep-link and verify the same records.

**List query contract:** Draft filter controls do not hit the API until the user clicks **Filter** or **Search**. Applied values are written to the URL so refresh/back preserves state. Search fields include an inline **×** clear; a **Clear** control appears beside filters when any applied filter is active.

**Deferred:** Product Settings, AI panels, Brands module (display label only today), Marketplace, drag-reorder UX, paid membership gates.

---

## 5. Permissions

| Code | Meaning |
| --- | --- |
| `PERM-PRD-001` | View published |
| `PERM-PRD-002` | Manage / lifecycle / archive / restore |
| `PERM-PRD-010` | Delete product (Class D) |
| `PERM-CAT-001` / `002` / `010` | Analogous for categories |

Class D is never implied by manage. Marketing/Content do not hold manage in V1.

---

## 6. History, Activity, Audit

| Concept | Responsibility |
| --- | --- |
| History | Entity field/state change diffs for one record |
| Activity | User interactions on that entity |
| Audit Log | Platform-wide privileged actions (`GRD-053`) — not duplicated as a Products tab |

---

## 7. Database models

`DB-010` Categories, `DB-011` Products, `DB-012` ProductVariants, `DB-013` ProductMedia (product-owned association + opaque `assetId`), `DB-014` ProductCategoryLinks, `product_relations` (cross-sell extension).

**Product fields (beyond core):** `short_description`, `is_featured`, `brand_name` (label until Brands module), `featuredAssetId`, `product_type` (incl. variable/subscription kinds), `tags`, `medical_info` (derived summary from attributes), `attributes` (catalog attribute defs: `name`, `values`, `forVariation`, **per-attribute `din` / `dose`** — DIN/Dose are not independent product fields), `questionnaire_binding_ref`, inventory catalog fields (`gtin`, `sold_individually`), shipping dims/class/`one_time_shipping`, linked merchandising (`bundle_sells_*` + `product_relations` upsell/cross-sell/bundle), `default_variation_options`, advanced (`purchase_note`, `menu_order`, `enable_reviews`, `limit_subscription`), Stripe presentation prefs (`stripe_button_position`, `stripe_gateways` JSON — Payments owns charge execution).

**Variant:** `sale_price_cents`, `option_values` (attribute picks for variable products).

**Product Data editor tabs:** General, Inventory (SKU/GTIN/sold individually; stock stub), Shipping, Linked Products, Attributes, Variations, Advanced, Stripe Settings.

**Attribute creation:** Attributes are created only through **Attribute name → Add new**; there is no preset/existing-attribute dropdown. Every new attribute card contains its name, values, per-attribute DIN, per-attribute Dose/Strength, and “Used for variations” setting.

**Category fields (beyond core):** `parent_id` (hierarchy), `thumbnailAssetId`, `min_quantity` / `max_quantity` / `group_of`, `display_type`, header align/image fields, `content_permission_roles` (Store role allowlist; empty = everyone).

Lifecycle: `draft` → `review` → `published` → `unpublished` → `archived` (Trash tab).

---

## 8. Services and APIs

Backend modules: `products`, `categories` under `apps/api/src/modules/`. Controllers: public `/v1/products`, `/v1/categories` and admin `/v1/admin/products`, `/v1/admin/categories`.

Admin product list supports `q`, `status`, `productType`, `categoryId`, `brandName`, pagination, and returns `statusCounts`. Additional actions: `POST …/duplicate`, `POST …/toggle-featured`, `POST …/bulk-delete` (Class D), lifecycle transitions, variants with sale price, media attach, history, activity, inventory stub.

Category admin list returns hierarchy `depth` plus `_count.productLinks`. Create/update accept parent and merchandising/permission fields.

---

## 9. Destructive operations

| Operation | Permission | Confirmation | Audit |
| --- | --- | --- | --- |
| Archive / restore product (Trash) | `PERM-PRD-002` | Yes | Yes |
| Delete product | `PERM-PRD-010` | Yes | Yes; blocked when published without archive first / order retention |
| Delete category | `PERM-CAT-010` | Yes | Yes; blocked if products or children remain |

---

## 10. Dependencies

Guardian foundation; RBAC; Class D codes in API; Asset attach uses opaque `assetId` until Asset Library ships ([33](33-asset-library-module.md)); Inventory summary stubs until Inventory ships; QST binding ref required for Rx publish (`OR-14`); Brands module deferred (`brand_name` label only).

---

## 11. Future enhancements (explicitly out of P8 core)

Product Settings, AI assist, Brands entity module, Bundles/Kits depth, Digital products, Marketplace/Vendors, Recommendations graph UI, paid membership gates, drag-and-drop category reorder. Phase **P10** Internal Platform UX/UI Modernization remains the shared polish track — this catalog UI follows Guardian patterns without inventing a separate design system.

---

## 12. Testing

Authorization (incl. Class D negatives), lifecycle/`OR-14`, published-only public APIs, Inventory/Asset Library boundary (no stock mutation / no binary upload / no provider URLs on Products), seed demo categories (`AC-PRD-003` / `AC-BR-06`), list filters/status counts, category hierarchy + permission roles persistence.

---

## 13. Definition of done

Backend + Guardian mini-apps for Products and Categories (list + shared create/edit editors); Class D delete gated; seed catalog; docs aligned ([27](27-module-registry.md), [26](26-implementation-tracker.md), this document).

---

## Revision History

| Version | Date | Author | Changes |
| --- | --- | --- | --- |
| 1.0 | 2026-07-29 | Platform Engineering | Initial Products Module Blueprint instance from approved plan |
| 1.1 | 2026-07-29 | Platform Engineering | Catalog admin UX parity: product/category editors, hierarchy, merchandising fields, list hover/bulk/filter patterns |
| 1.2 | 2026-07-29 | Platform Engineering | URL-synced list filters, bottom pagination bar, canonical `:id/edit` routes, full UUID display, Filter-on-click + clear controls |
| 1.3 | 2026-07-29 | Platform Engineering | Full Product Data tabs: Inventory/Shipping/Linked/Attributes/Variations/Advanced/Stripe prefs |
| 1.4 | 2026-07-29 | Platform Engineering | DIN/Dose moved onto each catalog attribute (not independent product fields) |
| 1.5 | 2026-07-29 | Platform Engineering | Removed preset attribute dropdown; all attributes are added through Add new with values, DIN, Dose, and variation settings |
| 1.6 | 2026-08-03 | Platform Engineering | Asset Library boundary (`featuredAssetId` / `thumbnailAssetId`); Products own relationships; never provider URLs; link [33](33-asset-library-module.md) |
| 1.7 | 2026-08-03 | Platform Engineering | Inventory boundary strengthened: consume via Inventory services only; digital no-track pointer; P12 sibling [34](34-inventory-module.md) |

*End of 31 — Products Module.*
