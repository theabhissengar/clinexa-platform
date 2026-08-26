# 37 — Promotions module

| Field | Value |
| --- | --- |
| Document | Promotions / Coupons / Pricing |
| Product | Clinexa |
| Status | In delivery — Phase 2 MVP |
| Related | [15](15-payment-flow.md), [35](35-orders-module.md), [10](10-database-design.md), [11](11-api-design.md) |

Promotions owns coupon eligibility and price calculation. Payments never calculates discounts. Orders persists finalized totals and a pricing snapshot, then charges `order.totalCents`.

## Validation vs pricing vs redemption

| Service | Responsibility |
| --- | --- |
| `CouponValidationService` | Eligibility only (active, dates, scope, min order, advisory usage). **Does not** consume usage. |
| `PricingEngineService` | Computes line discounts and order totals via existing `OrderTotalsService`. |
| `CouponsService` | CRUD/deactivate/Class D delete; **atomic** redemption on capture success. |

Create-order boundary: Orders may pass an opaque `couponCode` plus product/line context. Orders must not inspect Coupon rules. Staff/manual `discountTotalCents` / line `discountCents` remain pre-existing P13 pricing fields; when `couponCode` is present, Promotions totals are authoritative.

API-144 `applicability`, if sent, must be `ORDER`. Other enum values are rejected. The service always persists `ORDER`.

## Redemption concurrency

Redemption runs **only after successful payment capture**. Usage limits are re-checked in a single transaction with a coupon row lock.

If capture succeeds but the limit is already consumed, Promotions records `FAILED_LIMIT` and Orders writes `coupon_redemption_failed` activity. Payment capture is **not** rolled back.

## Extensible schema

`Coupon.applicability` includes future values (`SUBSCRIPTION`, `RENEWAL`, …). Phase 2 evaluates **ORDER** + manual codes only. `rulesJson`, `isAutomatic`, `stackingGroup`, and `priority` are stored for Phase 3+ and unused by the MVP engine. **Product Phase 3 (Users/Orders/Subscriptions/Renewals expansion) did not activate these coupon Phase 3+ fields.**

Historical orders are immutable: `Order.pricingSnapshotJson` plus cent totals remain the source of truth after a coupon is edited or deactivated.

## APIs (P15)

| ID | Path | AuthZ |
| --- | --- | --- |
| API-142 | `POST /v1/coupons/validate` | `PERM-CPN-002` |
| API-143–146 | `/v1/admin/coupons` CRUD / deactivate | `PERM-CPN-001` |
| API-147 | `GET /v1/admin/coupons/{id}/redemptions` | `PERM-CPN-001` |
| Class D | `POST /v1/admin/coupons/{id}/delete` | `PERM-CPN-010` |

Guardian coupon UI is a thin client of these APIs. Store checkout (`API-060`–`061`) remains deferred.
