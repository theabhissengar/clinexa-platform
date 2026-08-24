# 29 — Navigation Blueprint

| Field | Value |
| --- | --- |
| Document | Navigation Blueprint — Internal Platform |
| Product | Clinexa |
| Version | 1.0 |
| Status | Draft for review |
| Audience | Frontend architects, frontend engineers, product, design, QA |
| Source of truth | [00 — Product Requirements Document](00-product-requirements-document.md) |
| Related docs | [05 — System architecture](05-system-architecture.md), [08 — Role permissions](08-role-permissions.md), [18 — CRM](18-crm.md), [20 — UI design system](20-ui-design-system.md), [21 — Development guidelines](21-development-guidelines.md), [25 — Guardian](25-guardian.md), [26 — Implementation tracker](26-implementation-tracker.md), [27 — Module registry](27-module-registry.md), [28 — Ownership matrix](28-ownership-matrix.md), [30 — Migration and verification](30-migration-and-verification.md) |

This document is the authoritative design for **navigation and routing** in the Clinexa Internal Platform: sidebar philosophy, navigation groups, nesting and fly-outs, breadcrumb generation, permission visibility, context switching, routing conventions, responsive behavior, and deferred capabilities (search, pinned modules, favorites, recent).

It complements—not replaces—the shell contract in [18 — CRM §4](18-crm.md#4-application-shell) and the Guardian module catalog in [25 — Guardian](25-guardian.md). Implementation lives in `apps/admin`; `NAV-*` IDs are logical controls, not code.

---

## Table of contents

1. [Philosophy](#1-philosophy)
2. [Routing Contract](#2-routing-contract)
3. [Navigation Catalog Model](#3-navigation-catalog-model)
4. [Sidebar Design](#4-sidebar-design)
5. [Guardian Navigation Groups](#5-guardian-navigation-groups)
6. [CRM Navigation](#6-crm-navigation)
7. [Breadcrumbs](#7-breadcrumbs)
8. [Permission and Context Visibility](#8-permission-and-context-visibility)
9. [Context Switching](#9-context-switching)
10. [Responsive and Mobile Behavior](#10-responsive-and-mobile-behavior)
11. [Future Capabilities](#11-future-capabilities)
12. [Anti-patterns](#12-anti-patterns)
13. [Verification](#13-verification)
14. [Revision History](#14-revision-history)

---

## 1. Philosophy

| ID | Principle | Statement |
| --- | --- | --- |
| NAV-001 | One shell, two contexts | CRM and Guardian render through the same shell, the same sidebar and header components, and the same design tokens. Navigation content differs; navigation mechanics do not (`ARCH-163`, `UI-011`) |
| NAV-002 | Configuration over composition | Navigation is data. Adding a module means adding a catalog entry, a page, and a permission gate—never editing shell components (`CRM-051`) |
| NAV-003 | Navigation is an affordance, not a control | The catalog decides what a user *sees*; the API decides what a user *may do* (`FR-AUTH-004`, `RBAC-086`) |
| NAV-004 | Context is structural | The URL prefix is the single authoritative signal for context, active state, and breadcrumb roots (`ARCH-116`, `GRD-072`) |
| NAV-005 | Grouped where it helps, flat where it helps | Guardian uses grouped enterprise navigation because it has many administrative modules; CRM stays a short, role-scoped operational list |
| NAV-006 | Inspiration, not imitation | WordPress admin and similar consoles are studied for interaction patterns only. Clinexa's module catalog is derived from Clinexa's requirements. Guardian must never become a one-to-one clone of another product's menu (`GRD-012`) |
| NAV-007 | Earned depth | Nesting exists to reduce cognitive load, not to mirror an org chart. A group with one child is not a group; a module with one page is not a section |
| NAV-008 | Destructive actions are never navigation | Delete, archive, restore, and corrections are actions inside a module, never sidebar entries |

---

## 2. Routing Contract

### 2.1 Context prefixes (decided)

| Context | Prefix | Shell permission | Lifecycle |
| --- | --- | --- | --- |
| CRM | `/crm/*` | `PERM-CRM-020` | Operational |
| Guardian | `/guardian/*` | `PERM-GRD-001` | Administrative |

| ID | Rule |
| --- | --- |
| NAV-010 | Every authenticated internal route lives under exactly one context prefix. There are no context-less protected module routes |
| NAV-011 | The context is the first path segment after the origin and is resolved from the pathname alone—never from a cookie, header, or client store |
| NAV-012 | Shared authentication routes (sign-in, password reset) stay outside both prefixes; they are context-neutral |
| NAV-013 | `/` resolves to the principal's default context landing page (§9.3), or to sign-in when unauthenticated |
| NAV-014 | A route that would exist in both contexts is two routes with different action sets, not one route with a mode flag |

### 2.2 Module as mini application

Each module owns a route subtree under its context. Example for a Guardian module:

```text
/guardian/products                    → List (query: status, q, categoryId, productType, brand, page)
/guardian/products/new                → Create
/guardian/products/:id                → Redirect → Edit (stable deep link)
/guardian/products/:id/edit           → Edit (canonical)
/guardian/products/:id/history        → History
/guardian/products/:id/activity       → Activity
/guardian/products/logs               → Logs (reserved)
/guardian/products/settings           → Module settings (reserved)

/guardian/categories                  → List (query: q, page)
/guardian/categories/new              → Create
/guardian/categories/:id              → Redirect → Edit (stable deep link)
/guardian/categories/:id/edit         → Edit (canonical)

/guardian/assets                      → Asset Library index (query: status, q, page)
/guardian/assets/upload               → Upload
/guardian/assets/:id                  → View
/guardian/assets/:id/edit             → Edit metadata
/guardian/assets/:id/history          → History
/guardian/assets/:id/activity         → Activity
```

Asset Library V1 omits folders/collections/tags routes (reserved). See [33](33-asset-library-module.md). Existing stub `/guardian/media` renames at implementation.

The same shape applies in CRM, for example `/crm/orders/:id/history`.

**Orders mini-app routes** ([35](35-orders-module.md)):

```text
# CRM (operational — no create)
/crm/orders
/crm/orders/:id
/crm/orders/:id/edit
/crm/orders/:id/history
/crm/orders/:id/activity
/crm/orders/:id/notes

# Guardian (administrative + Class D)
/guardian/orders
/guardian/orders/new
/guardian/orders/:id
/guardian/orders/:id/edit
/guardian/orders/:id/history
/guardian/orders/:id/activity
/guardian/orders/:id/notes
```

CRM must **not** expose `/crm/orders/new`. Class D actions render only under Guardian detail.

| ID | Rule |
| --- | --- |
| NAV-015 | Not every module implements every page; the hierarchy is the standard shape, not a mandate (`GRD-074`, `GRD-075`) |
| NAV-016 | Detail pages are addressable and deep-linkable; state that changes the visible record belongs in the URL, not only in client state |
| NAV-017 | Sub-pages of a record (History, Activity) nest under the record, not as sibling top-level routes |
| NAV-018 | Destructive confirmations may use a dedicated route or a modal, but the destructive permission is checked server-side on execution either way |

### 2.3 Legacy path migration

| ID | Rule |
| --- | --- |
| NAV-019 | Legacy un-prefixed internal paths (`/users`, `/orders`, `/settings`, `/administration`, …) redirect permanently to their context-prefixed equivalents |
| NAV-020 | Redirect targets follow ownership: administrative modules land in Guardian, operational modules land in CRM (see [18 §2.8](18-crm.md#28-relationship-with-guardian)) |
| NAV-021 | Redirects are added in the same change that introduces the prefixed route, so no internal deep link breaks mid-migration. Sequencing and revert expectations live in [30 §2.2](30-migration-and-verification.md#22-step-2--redirect-legacy-paths-p2) |

Initial mapping from the current foundation catalog:

| Legacy route | Target |
| --- | --- |
| `/` | Default context landing (§9.3) |
| `/users` | `/guardian/users` |
| `/orders` | `/crm/orders` (administrative order surfaces at `/guardian/orders`) |
| `/prescriptions` | `/crm/prescriptions` |
| `/questionnaires` | `/crm/questionnaires` |
| `/activity-log` | `/guardian/activity-log` |
| `/reports` | `/crm/reports` |
| `/settings` | `/guardian/settings` |
| `/administration` | `/guardian/administration` |

---

## 3. Navigation Catalog Model

The catalog remains a single flat, ordered list with structural metadata—not a nested component tree.

| Field | Purpose | Notes |
| --- | --- | --- |
| `title` | Display label | Also the breadcrumb label (§7) |
| `route` | Absolute route including context prefix | Authoritative for active state |
| `icon` | Sidebar icon | Lucide only ([21](21-development-guidelines.md)) |
| `context` | `crm` \| `guardian` | **New.** First filter applied |
| `group` | Navigation group key | **New.** Required in Guardian; optional in CRM |
| `parent` | Parent entry key for nested modules | **New.** Enables nesting and fly-outs without a separate tree |
| `permission` | Single permission or any-of list | Existing behavior retained |
| `order` | Sort order within its group or level | Existing |
| `badge` | Count or status affordance | Existing; optional |
| `hidden` / `disabled` | Catalog-level suppression | Existing |
| `featureFlag` | Flag gate | Existing; must not gate clinical or payment rules (`ARCH-149`) |

| ID | Rule |
| --- | --- |
| NAV-030 | The catalog is the single source of truth for the sidebar **and** breadcrumbs; no parallel breadcrumb map exists |
| NAV-031 | Filtering order is fixed: **context → permission → hidden/flag → sort**. Any other order risks leaking the existence of a module a principal cannot access |
| NAV-032 | Groups are metadata, not components. Rendering a group is derived from entries that share a `group` key |
| NAV-033 | Nesting is expressed with `parent`, capped at two levels of visible depth (group → module → sub-module) |
| NAV-034 | An entry without a `context` is invalid and must fail review |

---

## 4. Sidebar Design

The sidebar is the permanent primary navigation for both contexts.

| ID | Capability | Status | Rule |
| --- | --- | --- | --- |
| NAV-040 | Permission-filtered entries | Required | Entries the principal cannot access are absent, not disabled |
| NAV-041 | Context filtering | Required | Only the active context's entries render |
| NAV-042 | Expandable groups | Required | Guardian groups expand and collapse; expansion state persists per user within a session |
| NAV-043 | Nested modules | Required | Sub-modules render beneath their parent when expanded |
| NAV-044 | Fly-out submenus | Required | When the sidebar is collapsed, hovering or focusing a group opens a fly-out listing its children; fly-outs are keyboard-operable and expose expanded state |
| NAV-045 | Collapse / expand (desktop) | Existing | Shell chrome concern, not a module concern |
| NAV-046 | Off-canvas (mobile) | Existing | Shell chrome concern |
| NAV-047 | Active state | Required | Derived from pathname prefix matching, so a record sub-page keeps its module active |
| NAV-048 | Empty groups | Required | A group with zero visible children does not render |
| NAV-049 | Badges | Optional | Counts are advisory; they must not reveal data the principal cannot open |
| NAV-050 | Pinned / favorites / recent / global search | Future | §11 — the model must not preclude them |

---

## 5. Guardian Navigation Groups

Guardian uses **grouped enterprise navigation**. Group membership comes from the Module Registry; the table below is the authoritative group set.

| Group key | Label | Intent | Representative modules |
| --- | --- | --- | --- |
| `dashboard` | Dashboard | Home, platform KPIs | `GRD-030` |
| `commerce` | Commerce | Catalog and commerce administration | Products, categories, Inventory (Guardian admin), orders (admin), subscriptions (admin), pricing, taxes, shipping |
| `content` | Content | Content and reusable asset administration | Pages, blogs, Asset Library, homepage, FAQs, review moderation |
| `users` | Users | Identity administration | Users (`/guardian/users` — list + tabbed editor per [32](32-users-module.md)), Roles and permissions (`/guardian/roles`) |
| `marketing` | Marketing | Growth configuration | Coupons, campaigns, templates |
| `platform` | Platform | Configuration and governance | Settings, feature flags, integrations, appointment types, audit log, activity log, system logs, data cleanup |
| `security` | Security | Account and session security | Future (`GRD-058`) |
| `developer` | Developer | Programmatic access | API keys, webhooks |
| `analytics` | Analytics | Deferred | Reports are CRM-only (`CRM-048`); no Guardian Analytics group in foundation |
| `support` | Support | Administrative visibility into support operations | Optional; CRM owns triage |

| ID | Rule |
| --- | --- |
| NAV-060 | Group order is stable and deliberate: Dashboard, Commerce, Content, Users, Marketing, Platform, Security, Developer, Support (Analytics deferred — Reports live under CRM only) |
| NAV-061 | A new Guardian module joins an existing group where one fits. Creating a group requires a Module Registry update and a note in the Implementation Tracker |
| NAV-062 | Group labels are nouns describing a domain, never verbs or role names |
| NAV-063 | The module catalog evolves with Store and Portal requirements (SEO, search configuration, merchandising, landing pages); those arrive as entries inside existing groups wherever possible (`GRD-013`) |

---

## 6. CRM Navigation

CRM navigation is a short, role-scoped operational list. It does **not** adopt the Guardian group model.

| ID | Rule |
| --- | --- |
| NAV-070 | CRM entries are ordered by operational priority for the signed-in role: the primary queue first, then supporting surfaces |
| NAV-071 | Grouping in CRM is optional and used only when a role legitimately sees many entries; a flat list is preferred |
| NAV-072 | CRM never lists administrative modules. When an operational task needs one, the module surfaces a permission-aware escalation link into Guardian (`CRM-167`)—not a sidebar entry |
| NAV-073 | CRM never lists destructive actions (`NAV-008`) |

Representative CRM ordering: Dashboard → primary queue (Clinical Review for Doctor, Pharmacy for Pharmacist, Support for Support, Orders for Operations) → Orders → Prescriptions → Patients → Documents → Appointments → Subscriptions → Reports.

CRM does **not** list Inventory as an administration module. Ops observe availability and low-stock signals inside Orders/fulfillment; escalate to Guardian Inventory (`/guardian/inventory`) for adjust/receive/warehouse/policy work ([34](34-inventory-module.md), `NAV-105`).

Subscriptions mini-app (shared module; actions differ by context — [36](36-subscriptions-module.md)):

```text
/crm/subscriptions
/crm/subscriptions/:id
/crm/subscriptions/:id/edit
/crm/subscriptions/:id/history
/crm/subscriptions/:id/activity
/crm/subscriptions/:id/notes
```

**No** `/crm/subscriptions/new`. **No** Renewals navigation section.

```text
/guardian/subscriptions
/guardian/subscriptions/new
/guardian/subscriptions/:id
/guardian/subscriptions/:id/edit
/guardian/subscriptions/:id/history
/guardian/subscriptions/:id/activity
/guardian/subscriptions/:id/notes
/guardian/subscriptions/plans
/guardian/subscriptions/plans/new
/guardian/subscriptions/plans/:id/edit
```

---

## 7. Breadcrumbs

| ID | Rule |
| --- | --- |
| NAV-080 | Breadcrumbs are generated from the navigation catalog plus the current pathname; navigation titles are the single source of truth |
| NAV-081 | The context segment is the breadcrumb root and is rendered as the context name (“CRM”, “Guardian”), linking to that context's landing page |
| NAV-082 | Group names appear in Guardian breadcrumbs when they add clarity, and are not links unless a group landing page exists |
| NAV-083 | Record segments resolve to a human label (order number, product name) supplied by the page, with the raw identifier as fallback |
| NAV-084 | Sub-pages append their own segment (`History`, `Activity`, `Edit`) after the record |
| NAV-085 | Breadcrumbs never reveal a label for a record the principal cannot read; unauthorized deep links fail before breadcrumb rendering |

Examples:

```text
Guardian / Commerce / Products / Acme 5 mg / Edit
CRM / Orders / ORD-10482 / History
```

---

## 8. Permission and Context Visibility

| ID | Rule |
| --- | --- |
| NAV-090 | An entry renders only when the principal holds the context permission **and** the entry's permission (any-of semantics for permission lists) |
| NAV-091 | Permission claims carried in the session are advisory UI hints; the API re-resolves authorization on every request (`CRM-067`) |
| NAV-092 | Hiding is the default treatment for “no access”; disabled-but-visible is reserved for state-based unavailability (for example, an action blocked by a clinical gate), never for authorization |
| NAV-093 | A permission or role change bumps the session/token version; the next shell load reflects current grants without a manual refresh (`CRM-054`) |
| NAV-094 | Destructive permissions never affect navigation—only in-module action visibility |
| NAV-095 | Navigation must not disclose module existence through counts, empty states, or error text for principals lacking access |

---

## 9. Context Switching

### 9.1 The Application Switcher

Replaces the `VendorSwitcher` placeholder in the header.

| ID | Rule |
| --- | --- |
| NAV-100 | The switcher lists only contexts the principal can access. A principal with one context sees a static label, not a control |
| NAV-101 | Switching navigates to the target context's landing page and changes navigation and prefix only |
| NAV-102 | Switching reuses the current session: no re-authentication, no theme reset, no shell remount that loses scroll or sidebar state |
| NAV-103 | The switcher does not imply multi-vendor. Vendor switching, if introduced, is a separate header abstraction |
| NAV-104 | Deep-linking into a context the principal cannot access returns an authorization error, never a silent redirect that hides the boundary from logs |

### 9.2 Cross-context navigation

| ID | Rule |
| --- | --- |
| NAV-105 | Escalation links from CRM to Guardian carry the target record (`/guardian/orders/:id`) and are hidden when the principal lacks Guardian access |
| NAV-106 | Returning from Guardian to CRM is ordinary navigation; the platform does not maintain a hidden “return stack” |

### 9.3 Default landing context

| ID | Rule |
| --- | --- |
| NAV-107 | Default context is role-based: clinical and operational roles land in CRM; administrative roles (Administrator, Super Administrator, Marketing, Content) land in Guardian |
| NAV-108 | A principal with access to exactly one context always lands there |
| NAV-109 | A principal with access to neither context is denied the shell (`RBAC-023`) |
| NAV-110 | Post-login redirect honors a valid, authorized deep link over the default landing page |

---

## 10. Responsive and Mobile Behavior

| ID | Rule |
| --- | --- |
| NAV-120 | The Internal Platform targets desktop ≥ 1024 px, preferring ≥ 1280 px (`NFR-100`); it is not a primary mobile clinical workstation |
| NAV-121 | Below the desktop breakpoint the sidebar becomes off-canvas; groups remain expandable and fly-outs degrade to inline expansion |
| NAV-122 | The Application Switcher remains reachable at every breakpoint |
| NAV-123 | Breadcrumbs truncate from the middle on narrow viewports, always preserving the context root and the current page |
| NAV-124 | Navigation is fully keyboard-operable at every breakpoint, with visible focus and logical order (`NFR-092`, `NFR-095`) |

---

## 11. Future Capabilities

Deferred, but the catalog model must not preclude them.

| Capability | Design note |
| --- | --- |
| Global search (command palette) | Searches the permission-filtered catalog first, then RBAC-filtered records via the existing search API; never returns entries the principal cannot open |
| Pinned modules | Per-user pins reference catalog keys; pins are re-validated against permissions on every load |
| Favorites | Same mechanism as pins, presented separately if product requires it |
| Recent | Per-user recent routes, re-validated against permissions and dropped when access is lost |
| Per-context landing preferences | Overrides the role-based default within accessible contexts |
| Notification center entry | Header slot, not a sidebar entry (`NTF-015`/`017` remain out of V1) |

| ID | Rule |
| --- | --- |
| NAV-130 | Every future capability re-validates permissions at render time; stored user preferences are never an authorization source |
| NAV-131 | No future capability may introduce a second navigation source of truth |

---

## 12. Anti-patterns

| Anti-pattern | Why it is rejected |
| --- | --- |
| Separate sidebar or header components per context | Creates two products from one platform (`UI-011`) |
| A `mode` flag on a shared route instead of two routes | Makes destructive exposure a runtime condition instead of a structural boundary |
| Deriving context from client state or a cookie | Breaks deep links, breadcrumbs, and server-side guards (`NAV-011`) |
| Disabling instead of hiding unauthorized entries | Discloses module existence and invites support noise |
| A second breadcrumb map | Guarantees drift from navigation titles |
| Mirroring another admin product's menu | Produces modules Clinexa does not need and hides ones it does (`NAV-006`) |
| Destructive actions as sidebar entries | Makes data loss a navigational accident |
| Deep nesting beyond two visible levels | Hides work behind hover chains |

---

## 13. Verification

| Check | Expectation |
| --- | --- |
| Context routing | Every internal route resolves under `/crm/*` or `/guardian/*`; legacy paths redirect |
| Context isolation | A CRM-only principal receives no Guardian entries, no switcher entry, and an authorization error on `/guardian/*` deep links |
| Filter order | Catalog filtering applies context before permission in all render paths |
| Breadcrumbs | Generated from the catalog; root is the context; record labels resolve or fall back to identifiers |
| Destructive absence | No destructive affordance exists anywhere under `/crm/*`, including bulk menus |
| Group rendering | Empty groups do not render; single-child groups are reviewed for necessity |
| Keyboard | Groups, fly-outs, and the switcher are operable and announce state without a pointer |
| Unity | Screenshots of equivalent CRM and Guardian pages are indistinguishable except for content and navigation |

Detailed test cases live in [22 — Testing strategy](22-testing-strategy.md); phase-level verification in [26 — Implementation tracker](26-implementation-tracker.md).

---

## 14. Revision History

| Version | Date | Author | Reviewer | Changes | Status |
| --- | --- | --- | --- | --- | --- |
| 1.0 | 2026-07-27 | Architecture (Clinexa planning) | Pending | Initial Navigation Blueprint: philosophy, routing contract and legacy redirects, context-aware catalog model, sidebar capabilities, Guardian groups, CRM ordering, breadcrumbs, visibility rules, context switching, responsive behavior, future capabilities, anti-patterns, verification (`NAV-001`–`NAV-131`) | Draft for review |
| 1.1 | 2026-07-28 | Platform Engineering | Pending | Legacy `/questionnaires` redirects only to CRM; Platform group no longer lists questionnaires | Draft for review |
| 1.2 | 2026-08-02 | Platform Engineering | Pending | Users group pages clarified (Users list/editor tabs, Roles); link [32](32-users-module.md) | Draft for review |
| 1.3 | 2026-08-03 | Platform Engineering | Pending | Asset Library routes `/guardian/assets`; Content group label; link [33](33-asset-library-module.md) | Draft for review |
| 1.4 | 2026-08-03 | Platform Engineering | Pending | Commerce Inventory (Guardian admin); CRM has no Inventory admin nav; escalate to `/guardian/inventory`; link [34](34-inventory-module.md) | Draft for review |
| 1.5 | 2026-08-20 | Platform Engineering | Pending | Orders mini-app routes CRM (no create) + Guardian (`/new` + Class D); link [35](35-orders-module.md) | Draft for review |
| 1.6 | 2026-08-24 | Platform Engineering | Pending | Subscriptions mini-app routes CRM (no create) + Guardian (`/new`, plans, Class D); no Renewals nav; link [36](36-subscriptions-module.md) | Draft for review |
| 1.7 | 2026-08-24 | Platform Engineering | Pending | P14c: CRM `/crm/subscriptions` list/detail/edit/history/activity/notes implemented; Guardian routes still placeholders | Draft for review |
| 1.8 | 2026-08-24 | Platform Engineering | Pending | P14d: Guardian `/guardian/subscriptions` list/create/detail/edit/history/activity/notes/plans implemented; nav gated by `PERM-SUB-004` | Draft for review |

---

## Document control

| Item | Value |
| --- | --- |
| Classification | Internal planning |
| Owner | Frontend Architecture (Clinexa planning) |
| Control catalog | `NAV-001` – `NAV-131` |
| Change rule | Navigation changes that affect context boundaries or destructive exposure require matching updates in [18](18-crm.md), [25](25-guardian.md), and [27](27-module-registry.md) |

---

*End of 29 — Navigation Blueprint.*
