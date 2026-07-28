# 30 — Migration and Verification

| Field | Value |
| --- | --- |
| Document | Migration and Verification — Internal Platform contexts |
| Product | Clinexa |
| Version | 1.0 |
| Status | Draft for review |
| Audience | Architects, engineers, QA, security, engineering leadership |
| Source of truth | [00 — Product Requirements Document](00-product-requirements-document.md) |
| Related docs | [03 — Functional requirements](03-functional-requirements.md), [05 — System architecture](05-system-architecture.md), [08 — Role permissions](08-role-permissions.md), [11 — API design](11-api-design.md), [13 — Security](13-security.md), [18 — CRM](18-crm.md), [21 — Development guidelines](21-development-guidelines.md), [25 — Guardian](25-guardian.md), [26 — Implementation tracker](26-implementation-tracker.md), [27 — Module registry](27-module-registry.md), [28 — Ownership matrix](28-ownership-matrix.md), [29 — Navigation blueprint](29-navigation-blueprint.md) |

This document covers the two things that turn the architecture from a design into a delivered system: **how we get there** (§1–§2, migration) and **how we know we arrived** (§3–§5, verification and definition of done).

Phase state, ownership, branches, and pull requests live in [26 — Implementation tracker](26-implementation-tracker.md). This document holds the migration mechanics and the checks each phase must pass.

---

## Table of contents

1. [Migration principles](#1-migration-principles)
2. [Migration steps](#2-migration-steps)
3. [Verification strategy](#3-verification-strategy)
4. [Required test cases](#4-required-test-cases)
5. [Definition of done](#5-definition-of-done)
6. [Revision History](#6-revision-history)

---

## 1. Migration principles

| ID | Principle | Statement |
| --- | --- | --- |
| MIG-001 | No broken links | Every legacy internal path keeps working through a permanent redirect introduced in the same change as its replacement (`NAV-021`) |
| MIG-002 | Structure before content | Prefixes, guards, and the navigation catalog land before modules move. Moving a module into a structure that does not yet exist creates two migrations |
| MIG-003 | Nothing new mid-move | A relocation change moves a screen and adjusts its actions. It does not add features, redesign layout, or refactor unrelated code |
| MIG-004 | Server gate before UI affordance | A destructive affordance ships only after the API enforces its permission. UI absence is not a security control (`SEC-020a`) |
| MIG-005 | One session throughout | Introducing the second context never adds a login, a second token, or a separate session store (`GRD-005`) |
| MIG-006 | Reversible steps | Each step is independently revertable. A step that can only be undone by reverting three others is too large |
| MIG-007 | Documentation moves with code | The module relocation table, registry status, and matrix rows update in the same pull request as the move (`TRK-005`) |
| MIG-008 | No data migration | This is a routing, navigation, and authorization migration. No schema or record migration is implied; destructive semantics were always soft-delete first ([10 §2.3](10-database-design.md)) |

---

## 2. Migration steps

Steps map to the phases in [26 §5](26-implementation-tracker.md).

### 2.1 Step 1 — Introduce context prefixes (P2)

| Item | Detail |
| --- | --- |
| Change | Add route groups for `/crm/*` and `/guardian/*` inside the existing protected layout in `apps/admin`, keeping one shell |
| Guards | `/crm/*` requires `PERM-CRM-020`; `/guardian/*` requires `PERM-GRD-001`; both require an authenticated staff session (`GRD-076`–`081`) |
| Context resolution | Derived from the pathname only. No context state in storage, no context claim from the client (`NAV-004`) |
| Compatibility | Legacy paths continue to resolve via redirects added in Step 2 |
| Revert | Removing the route groups restores the previous structure because legacy paths remain live until Step 4 |

### 2.2 Step 2 — Redirect legacy paths (P2)

Current foundation routes and their targets:

| Legacy route | Target | Rationale |
| --- | --- | --- |
| `/` | Default context landing per [29 §9.3](29-navigation-blueprint.md) | Role-based default; deep links win |
| `/users` | `/guardian/users` | User lifecycle is administrative (`GRD-042`) |
| `/orders` | `/crm/orders` | Order work is operational; administrative order surfaces live at `/guardian/orders` |
| `/prescriptions` | `/crm/prescriptions` | Clinical and operational only |
| `/questionnaires` | `/crm/questionnaires` | CRM-only (definitions and case view) |
| `/reports` | `/crm/reports` | Reports are CRM-only |
| `/activity-log` | `/guardian/activity-log` | Governance surface |
| `/settings` | `/guardian/settings` | Platform configuration |
| `/administration` | `/guardian/administration` | Platform administration |

| Rule | Statement |
| --- | --- |
| MIG-010 | Redirects are permanent and single-hop. A redirect that lands on another redirect is a defect |
| MIG-011 | A redirect never elevates: a principal who cannot enter the target context receives the standard authorization response, not a silent bounce to a context they can enter |
| MIG-012 | Where a legacy path splits across contexts (orders, questionnaires, reports), the legacy path resolves to the **operational** target, since that is where the majority of existing traffic belongs |

### 2.3 Step 3 — Context-tag the navigation catalog (P2)

| Item | Detail |
| --- | --- |
| Change | Add `context`, `group`, and `parent` to catalog entries in `apps/admin/src/components/layout/nav-config.ts` per [29 §3](29-navigation-blueprint.md) |
| Filtering | Entries are filtered by context first, then by permission (`NAV-030`–`034`) |
| Breadcrumbs | Derived from the pathname against the catalog, with the context root as the first segment (`NAV-080`–`085`) |
| Compatibility | Catalog entries keep their existing permission gates; only structural metadata is added |

### 2.4 Step 4 — Relocate CRM modules (P4)

| Item | Detail |
| --- | --- |
| Change | Move operational screens under `/crm/*` and strip administrative and destructive affordances from them |
| Authority | The module relocation table in [18 §2.8](18-crm.md#28-relationship-with-guardian) decides what moves and what stays |
| Escalation | Where staff previously reached an administrative action from a CRM screen, the screen now offers an escalation link into the Guardian route, subject to the target permission (`NAV-105`–`106`) |
| Compatibility | Legacy redirects remain; in-app links are updated to prefixed paths in the same change |

### 2.5 Step 5 — Stand up Guardian (P5)

| Item | Detail |
| --- | --- |
| Change | Guardian dashboard, navigation groups, and module shells following the page hierarchy in [25 §5.3](25-guardian.md) |
| Shared modules | Users, Orders, Subscriptions, and Reports are mounted in both contexts with distinct action sets per [27 §7](27-module-registry.md#7-shared-modules-across-contexts) |
| Destructive gating | A destructive affordance appears only after Step 7 enforces its permission on the API (`MIG-004`) |
| Unity check | Guardian reuses the shell, tokens, and components unchanged (`GRD-091`–`095`, `UI-011`) |

### 2.6 Step 6 — Application Switcher (P2, completed alongside P5)

| Item | Detail |
| --- | --- |
| Change | Replace the Vendor Switcher placeholder with a CRM / Guardian switcher |
| Behavior | Permission-aware, session-reusing, theme-preserving. A context the principal cannot enter is not offered (`NAV-100`–`104`) |
| Non-implication | The switcher is not vendor switching and must not be built as a general tenant selector |

### 2.7 Step 7 — Gate destructive APIs (P6)

| Item | Detail |
| --- | --- |
| Change | Enforce Class D permissions on every destructive endpoint; fail closed; audit actor, target, and scope (`API-020`–`026`) |
| Grants | Class D grants are assigned narrowly and explicitly; bulk cleanup and hard-delete execution stay with Super Administrator (`RBAC-033`) |
| Order of operations | This step is a prerequisite for exposing destructive affordances in Guardian, not a follow-up to it |

### 2.8 Step 8 — Reconcile registry and matrix (P7)

| Item | Detail |
| --- | --- |
| Change | Update module statuses in [27](27-module-registry.md) and action cells in [28](28-ownership-matrix.md) to the delivered state; keep Store, Portal, and future columns declared even where empty |
| Purpose | The registry and matrix become the standing answer to "where does this action live", so onboarding does not require reading route code |

---

## 3. Verification strategy

### 3.1 Ecosystem consistency

| Check | Expectation |
| --- | --- |
| VER-001 | Architecture documentation and diagrams show the Internal Platform, Store, Patient Portal, and the shared Backend API as one ecosystem (`ARCH-170`) |
| VER-002 | The Internal Platform is described as one application with two contexts everywhere it appears; no document treats CRM and Guardian as separate products (`ARCH-163`) |
| VER-003 | "Business Management System" appears nowhere as an official name |
| VER-004 | Adding a future consumer is expressible as new rows in [27](27-module-registry.md), a new column in [28](28-ownership-matrix.md), and new permission grants — with no change to module ownership or business rules (`ARCH-162`) |

### 3.2 Backend agnosticism

| Check | Expectation |
| --- | --- |
| VER-010 | No document or code convention assigns a backend module to a frontend application (`ARCH-161`) |
| VER-011 | Authorization uses identity, roles, permissions, and object scope only. No decision path reads an application, context, or surface claim from the client (`RBAC-011`, `API-021`) |
| VER-012 | An identical request with identical grants from two different clients produces an identical outcome |
| VER-013 | No clinical or payment rule exists in a client that does not exist in the API (`ARCH-140`) |

### 3.3 Routing and context isolation

| Check | Expectation |
| --- | --- |
| VER-020 | Every legacy path redirects once to its documented target, with no loop and no chain |
| VER-021 | `/crm/*` is refused without `PERM-CRM-020`; `/guardian/*` is refused without `PERM-GRD-001` |
| VER-022 | Context is derived from the pathname; forcing a mismatched context through client state changes nothing |
| VER-023 | Breadcrumbs begin at the context root and match the pathname on every route, including record and nested pages |
| VER-024 | A deep link into either context survives an intervening login and lands on the requested route |

### 3.4 RBAC and destructive containment

| Check | Expectation |
| --- | --- |
| VER-030 | No Class D permission is implied by a view, edit, manage, or publish grant (`RBAC-010`) |
| VER-031 | No CRM, Store, or Portal screen renders delete, archive, restore, financial correction, or override (`ARCH-165`) |
| VER-032 | Every destructive endpoint refuses a principal without its Class D grant, returning 403, regardless of client, origin, or headers |
| VER-033 | Every destructive success and every destructive denial is audited with actor, target, and scope |
| VER-034 | Unbounded bulk destructive scope is rejected; bulk cleanup requires an explicit bounded selector |
| VER-035 | Prescriptions, clinical notes, submitted questionnaire responses, and audit records expose no delete path in any client at any permission level (`OWN-008`) |
| VER-036 | Removing or stripping the last principal holding `PERM-ADM-001` is refused (`RBAC-035`) |
| VER-037 | Administrative grants confer no clinical authority: no Guardian surface and no administrative permission can approve, decline, or prescribe (`RBAC-031`) |

### 3.5 Registry and matrix completeness

| Check | Expectation |
| --- | --- |
| VER-040 | Every module in [27](27-module-registry.md) lists its consumers, including planned ones, and traces to at least one functional requirement |
| VER-041 | Every destructive operation named in [25 §3.1](25-guardian.md) has a dictionary entry in [08](08-role-permissions.md) and a row in the destructive summary of [28 §9](28-ownership-matrix.md) |
| VER-042 | Destructive actions appear only in the Guardian column of [28](28-ownership-matrix.md) |
| VER-043 | Shared modules state their operational and administrative split without contradiction between [18](18-crm.md), [25](25-guardian.md), [27](27-module-registry.md), and [28](28-ownership-matrix.md) |

### 3.6 Platform unity

| Check | Expectation |
| --- | --- |
| VER-050 | CRM and Guardian render the same chrome, tokens, spacing, and interaction patterns; a screenshot of one context's frame is indistinguishable from the other's (`UI-011`) |
| VER-051 | Switching context reuses the session, preserves theme, and never prompts for credentials (`MIG-005`) |
| VER-052 | Destructive actions use one consistent visual and confirmation treatment across Guardian (`UI-012`) |
| VER-053 | Both contexts are keyboard-operable through their primary flows, and destructive confirmations are reachable and dismissible by keyboard (`GRD-130`–`134`, `NAV-124`) |
| VER-054 | The shell works on the supported desktop posture and degrades correctly to the off-canvas sidebar on narrow viewports (`NAV-120`–`123`) |

---

## 4. Required test cases

Stated at planning level: what must be covered, not how to write it. Negative cases are as required as positive ones.

### 4.1 Context authorization

| ID | Case | Expected |
| --- | --- | --- |
| TC-001 | Staff principal with `PERM-CRM-020` only requests a `/guardian/*` route | Refused; no Guardian navigation rendered; switcher offers no Guardian entry |
| TC-002 | Staff principal with `PERM-GRD-001` only requests a `/crm/*` route | Refused; no CRM navigation rendered |
| TC-003 | Principal with both context permissions switches contexts | Same session, same theme, no re-authentication, correct prefix and breadcrumbs |
| TC-004 | Patient principal requests any `/crm/*` or `/guardian/*` route | Refused (`RBAC-009`, `RBAC-023`) |
| TC-005 | Unauthenticated request to either prefix | Redirected to login, then to the originally requested route |
| TC-006 | Permission revoked mid-session, then a protected route is requested | Refused on the next server evaluation; navigation re-filters (`NAV-093`) |

### 4.2 Destructive authorization

| ID | Case | Expected |
| --- | --- | --- |
| TC-010 | Principal with edit but not delete calls a delete endpoint | 403; nothing mutated; denial audited |
| TC-011 | Principal with the Class D grant calls the same endpoint | Success; audit records actor, target, and scope |
| TC-012 | Destructive call carrying a forged application or context claim, or a spoofed origin or referrer | Authorized identically to any other call: outcome depends only on grants (`API-021`) |
| TC-013 | Destructive call from a non-Guardian client with a valid grant | Authorized by permission; UI exposure rules are not an API bypass, and the absence of the affordance elsewhere is verified separately by `VER-031` |
| TC-014 | Bulk cleanup without a bounded selector | 422; nothing mutated |
| TC-015 | Hard-delete procedure invoked without `PERM-ADM-034` | 403; audit trail intact |
| TC-016 | Delete of the last principal holding `PERM-ADM-001` | Refused with a clear reason |
| TC-017 | Financial correction attempted with only `PERM-PAY-003` | 403; operational refund assist remains available |
| TC-018 | Administrative override applied | Succeeds only with `PERM-ORD-014`; audited with justification; no clinical gate silently bypassed |
| TC-019 | Delete attempted on a prescription, clinical note, submitted response, or audit record | No such endpoint exists; request fails |
| TC-020 | Restore of an archived record | Succeeds only with the restore grant; record returns to active state with history intact |

### 4.3 Routing and navigation

| ID | Case | Expected |
| --- | --- | --- |
| TC-030 | Each legacy path in §2.2 is requested | Single permanent redirect to the documented target |
| TC-031 | Deep link to a nested module page, unauthenticated | Login, then the exact requested page |
| TC-032 | Navigation group whose every child is permission-filtered out | Group is not rendered (`NAV-042`) |
| TC-033 | Breadcrumb rendering on overview, list, record, and nested pages | Matches the pathname; context root first |
| TC-034 | CRM screens audited for destructive affordances | None present; escalation links resolve into the correct Guardian route |
| TC-035 | Sidebar collapsed, then a nested module navigated to | Fly-out behavior works; active state resolves to the correct entry |
| TC-036 | Narrow viewport | Off-canvas sidebar; switcher reachable; breadcrumbs truncate without losing the current page |

### 4.4 Consumer-independence

| ID | Case | Expected |
| --- | --- | --- |
| TC-040 | Same read request issued by two clients whose principals hold the same grants | Identical response |
| TC-041 | Same write request issued by two clients where one principal lacks the grant | Success and 403 respectively; the difference traces to grants, never to the client |
| TC-042 | A rule change lands in the API | Every consumer observes the change without a client release |

---

## 5. Definition of done

The migration is complete when every statement below holds.

| Check | Statement |
| --- | --- |
| DOD-001 | Both context prefixes are live, guarded, and reachable through a permission-aware Application Switcher on one session |
| DOD-002 | Every legacy internal path redirects once to a documented target |
| DOD-003 | CRM exposes operational actions only; no destructive affordance exists in any CRM, Store, or Portal surface |
| DOD-004 | Guardian exposes the administrative lifecycle, with every destructive operation gated by a Class D permission server-side and audited |
| DOD-005 | Every check in §3 passes, and every case in §4 has coverage including its negative path |
| DOD-006 | [27](27-module-registry.md) and [28](28-ownership-matrix.md) reflect delivered state, with future consumers declared and empty cells left honest |
| DOD-007 | No backend module is owned by, or coupled to, a client application |
| DOD-008 | CRM and Guardian are visually and behaviorally one product |
| DOD-009 | [26](26-implementation-tracker.md) records every phase as Complete or explicitly Deferred with a reason, and every open decision affecting a shipped surface is closed |

---

## 6. Revision History

| Version | Date | Author | Changes |
| --- | --- | --- | --- |
| 1.0 | 2026-07-27 | Platform Engineering | Initial migration and verification document: principles `MIG-001`–`012`, eight migration steps with legacy redirect mapping, verification strategy `VER-001`–`054`, required test cases `TC-001`–`042`, definition of done `DOD-001`–`009` |

---

## Document control

| Field | Value |
| --- | --- |
| Owner | Platform architecture with QA and Security |
| Change rule | A migration step or verification check changes here before the behavior changes in code |
| Gate | No phase in [26](26-implementation-tracker.md) reaches Complete until its checks in §3 pass |

*End of 30 — Migration and Verification.*
