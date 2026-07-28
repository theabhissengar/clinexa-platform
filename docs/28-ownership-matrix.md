# 28 — Ownership Matrix

| Field | Value |
| --- | --- |
| Document | Ownership Matrix — Entity actions per consuming application |
| Product | Clinexa |
| Version | 1.0 |
| Status | Draft for review |
| Audience | Architects, engineers, product, QA, security |
| Source of truth | [00 — Product Requirements Document](00-product-requirements-document.md) |
| Related docs | [03 — Functional requirements](03-functional-requirements.md), [05 — System architecture](05-system-architecture.md), [08 — Role permissions](08-role-permissions.md), [10 — Database design](10-database-design.md), [11 — API design](11-api-design.md), [16 — Store architecture](16-store-architecture.md), [17 — Patient portal](17-patient-portal.md), [18 — CRM](18-crm.md), [25 — Guardian](25-guardian.md), [26 — Implementation tracker](26-implementation-tracker.md), [27 — Module registry](27-module-registry.md) |

This document records, for every significant entity, **which application surfaces which action**. It is the quick answer to "where does a user delete an order?" and, more importantly, "where must that never appear?"

It spans the Internal Platform contexts (Guardian and CRM), the Store, the Patient Portal, workers, and a column reserved for future applications. Columns for unbuilt applications are intentionally sparse.

> **This matrix does not assign module ownership.** Every entity below is owned by a **platform module** in the Backend API (`ARCH-161`). A cell says "this application exposes this action to a permitted principal", never "this application owns this entity". Authorization is always evaluated server-side against the principal, never against the calling application (`RBAC-011`).

---

## Table of contents

1. [How to read the matrix](#1-how-to-read-the-matrix)
2. [Applications](#2-applications)
3. [Action vocabulary](#3-action-vocabulary)
4. [Matrix — identity and access](#4-matrix--identity-and-access)
5. [Matrix — commerce](#5-matrix--commerce)
6. [Matrix — clinical and care](#6-matrix--clinical-and-care)
7. [Matrix — content and marketing](#7-matrix--content-and-marketing)
8. [Matrix — platform and governance](#8-matrix--platform-and-governance)
9. [Destructive summary](#9-destructive-summary)
10. [Adding an application](#10-adding-an-application)
11. [Revision History](#11-revision-history)

---

## 1. How to read the matrix

| Rule | Statement |
| --- | --- |
| OWN-001 | A cell lists the actions the application **exposes**, subject to the principal's permissions. An empty cell means the application exposes nothing for that entity |
| OWN-002 | Exposure is not authorization. Every listed action is still permission-checked server-side on every call (`FR-AUTH-004`) |
| OWN-003 | **Delete, Archive, Restore, Correct, and Override appear only in the Guardian column.** Any future entry elsewhere requires an explicit architecture revision (`ARCH-165`) |
| OWN-004 | "Own" qualifies a patient-scoped action: the principal may act only on their own records (`FR-AUTH-005`) |
| OWN-005 | Where CRM and Guardian both expose Edit, the fields differ by purpose, not the record by identity ([27 §7](27-module-registry.md#7-shared-modules-across-contexts)) |
| OWN-006 | Workers act on behalf of the system under domain rules, never as a way to reach an action a human is denied |
| OWN-007 | Future application columns may stay empty until the application exists. Emptiness is information, not an omission |
| OWN-008 | Clinical records and audit trails have no delete action in any column, at any permission level |

---

## 2. Applications

| Column | Application | Prefix or surface | Status |
| --- | --- | --- | --- |
| **Guardian** | Internal Platform — administrative context | `/guardian/*` | Planned (V1) |
| **CRM** | Internal Platform — operational context | `/crm/*` | In delivery (V1) |
| **Store** | Public commerce client | Store web | Planned (V1) |
| **Portal** | Authenticated patient self-service | Portal web | Planned (V1) |
| **System** | Workers and scheduled jobs | Internal | Planned (V1) |
| **Future** | Mobile app, admin mobile app, vendor portal, partner portal, public API clients | — | Future |

---

## 3. Action vocabulary

| Action | Meaning | Class |
| --- | --- | --- |
| **View** | Read a record within permitted scope | Routine |
| **Create** | Bring a new record into existence | Routine |
| **Edit** | Change fields on an existing record | Routine |
| **Publish / Unpublish** | Change public visibility of content or catalog | Routine (governed) |
| **Transition** | Advance a record through its state machine | Operational |
| **Assist** | Perform a policy-scoped operational courtesy such as a refund or cancellation within documented limits | Operational |
| **Export** | Produce a report or data extract within role scope | Operational (audited) |
| **Delete** | Soft-delete a record | **Destructive (Class D)** |
| **Archive** | Remove from active surfaces while retaining history | **Destructive (Class D)** |
| **Restore** | Return a deleted or archived record to active state | **Destructive (Class D)** |
| **Correct** | Rewrite financial truth through an administrative adjustment | **Destructive (Class D)** |
| **Override** | Force a state transition or policy exemption, audited | **Destructive (Class D)** |
| **Purge** | Execute a bounded bulk cleanup or documented hard-delete procedure | **Destructive (Class D)** |

---

## 4. Matrix — identity and access

| Entity | Guardian | CRM | Store | Portal | System | Future |
| --- | --- | --- | --- | --- | --- | --- |
| **Staff user** | View, Create, Edit, Delete, Archive, Restore, Purge | View | — | — | — | Admin mobile: View, Edit (subset) |
| **Patient user** | View, Create, Edit (administrative fields), Delete, Archive, Restore, Purge | View, Edit (operational, clinical, support fields within scope) | Create (self-registration) | View own, Edit own profile | Create (system-initiated), Edit (system fields) | Mobile: View own, Edit own |
| **Role assignment** | View, Create, Edit, Delete | — | — | — | — | — |
| **Permission grant** | View, Edit (via role configuration), Delete | — | — | — | Evaluate | — |
| **Session** | View active sessions (future Security area), Revoke (future) | — | Create (sign-in), Delete own (sign-out) | Create, Delete own | Expire | Mobile: Create, Delete own |
| **Audit record** | View, Export | — | — | — | Append | — |

---

## 5. Matrix — commerce

| Entity | Guardian | CRM | Store | Portal | System | Future |
| --- | --- | --- | --- | --- | --- | --- |
| **Product** | View, Create, Edit, Publish, Unpublish, Delete, Archive, Restore | View | View published | View purchased context | Index | Mobile: View published; Public API: View published |
| **Category** | View, Create, Edit, Publish, Delete, Archive, Restore | View | View published | — | Index | Public API: View published |
| **Cart** | — | — | Create own, Edit own, Delete own | View own | Merge on sign-in, Expire | Mobile: Create own, Edit own |
| **Order** | View, Create (administrative path), Edit (administrative fields), Delete, Archive, Restore, Correct, Override | View, Edit (operational fields), Transition, Assist (policy refund and cancel), Export | Create (checkout finalize) | View own, Assist request (cancel or support path) | Create (renewal), Transition | Mobile: View own; Admin mobile: View |
| **Payment** | View, Correct, Configure providers, Rotate credentials | View, Assist (policy-scoped refund) | Initiate intent | Update own payment method | Capture, Reconcile from webhooks | Mobile: Update own method |
| **Subscription** | View, Create, Edit (administrative fields), Delete, Archive, Restore | View, Create (operational assist), Edit (operational fields), Transition (renew, pause, resume) | Create (plan purchase) | View own, Edit own, Cancel own | Renew, Apply grace, Expire | Mobile: View own, Cancel own |
| **Subscription plan** | View, Create, Edit, Publish, Delete, Archive | View | View published | View own plan | — | — |
| **Inventory balance** | View, Edit (policy and thresholds), Purge (bulk adjustment cleanup) | View, Edit (adjustments) | — | — | Decrement on fulfillment, Alert on low stock | — |
| **Coupon** | View, Create, Edit, Delete, Archive | View | Apply code | — | Validate | — |
| **Pricing, tax, shipping configuration** | View, Create, Edit, Delete | View | Consume | Consume | Consume | — |

---

## 6. Matrix — clinical and care

| Entity | Guardian | CRM | Store | Portal | System | Future |
| --- | --- | --- | --- | --- | --- | --- |
| **Consultation** | — | View, Transition (approve, decline) | — | View own status | Create from paid intake | — |
| **Prescription** | — | View, Create (through clinical approval), Edit (clinical update path), Transition (pharmacy readiness) | — | View own status | Create on approval | Mobile: View own status |
| **Clinical note** | — | View, Create, Edit (Doctor only) | — | — | — | — |
| **Questionnaire definition** | — | View, Create, Edit, Publish, Version, Delete (unbound versions only) | Present on purchase path | Present assigned form | — | — |
| **Questionnaire response** | — | View (case context) | Create (purchase path) | Create own, Edit own while in progress, View own | Lock on submit | Mobile: Create own |
| **Appointment type and availability** | View, Create, Edit, Delete | View | — | View bookable slots | — | — |
| **Appointment** | — | View, Create (staff assist), Edit, Transition | — | Create own, Edit own, Cancel own | Remind, Expire | Mobile: Create own, Cancel own |
| **Document** | View (administrative), Purge (retention execution) | View (case scope), Create (upload where permitted), Edit metadata | — | View own, Export own | Generate, Apply retention | Mobile: View own |
| **Support ticket** | View (administrative visibility) | View, Edit, Transition (triage, resolve) | — | Create own, View own, Comment own | Notify | Mobile: Create own |
| **Notification preference** | View | View | — | View own, Edit own | Apply on dispatch | Mobile: Edit own |

---

## 7. Matrix — content and marketing

| Entity | Guardian | CRM | Store | Portal | System | Future |
| --- | --- | --- | --- | --- | --- | --- |
| **CMS page** | View, Create, Edit, Publish, Unpublish, Delete, Archive, Restore | View | View published | View published (legal, help) | Index | Public API: View published |
| **Blog post** | View, Create, Edit, Publish, Unpublish, Delete, Archive, Restore | View | View published | — | Index | Public API: View published |
| **Media asset** | View, Create, Edit metadata, Delete | View | Consume | Consume | — | — |
| **Homepage and FAQ block** | View, Create, Edit, Publish, Delete | — | View published | View published FAQ | — | — |
| **Product review** | View, Transition (approve, reject), Edit moderation policy, Delete | View | Create (authenticated purchaser), View moderated | View own | — | Mobile: Create own |
| **Notification template** | View, Create, Edit, Delete | View | — | — | Render on dispatch | — |
| **Campaign** | View, Create, Edit, Delete | — | — | — | Dispatch | — |

---

## 8. Matrix — platform and governance

| Entity | Guardian | CRM | Store | Portal | System | Future |
| --- | --- | --- | --- | --- | --- | --- |
| **Setting** | View, Edit | View (effective values where relevant) | Consume | Consume | Consume | — |
| **Feature flag** | View, Create, Edit, Delete | — | Consume | Consume | Consume | — |
| **Payment provider configuration** | View, Edit, Rotate, Delete | — | — | — | Consume | — |
| **Integration** | View, Create, Edit, Delete | — | — | — | Consume | — |
| **API key** | View, Create, Revoke, Delete | — | — | — | Verify | Public API: authenticate with |
| **Webhook endpoint** | View, Create, Edit, Delete | — | — | — | Receive, Verify | — |
| **Report definition** | View (future Class D tooling only) | View, Create (operational) | — | — | Execute | — |
| **Report artifact / export** | Purge only when implemented (no Reports UI) | View, Export (role-scoped) | — | Export own data where offered | Generate, Expire | — |
| **Activity log** | View | — | — | — | Append | — |
| **System log** | View, Purge (retention policy only) | — | — | — | Append, Rotate | — |
| **Vendor record** (future) | View, Create, Edit, Delete | — | — | — | — | Vendor portal: View own, Edit own |

---

## 9. Destructive summary

Every destructive action in this document, in one place.

| Action | Entities | Exposed in | Permission | Never exposed in |
| --- | --- | --- | --- | --- |
| Delete, Archive, Restore | Staff user, Patient user | Guardian | `PERM-ADM-030`–`032` | CRM, Store, Portal, workers |
| Delete, Archive, Restore | Order | Guardian | `PERM-ORD-010`–`012` | CRM, Store, Portal |
| Correct | Order, Payment | Guardian | `PERM-ORD-013` | CRM (policy refund assist is a different action) |
| Override | Order state, policy exemption | Guardian | `PERM-ORD-014` | Everywhere else; never silent, always audited |
| Delete, Archive, Restore | Subscription | Guardian | `PERM-SUB-010`–`012` | CRM, Portal (patient cancel is not a delete) |
| Delete | Product, Category | Guardian | `PERM-PRD-010`, `PERM-CAT-010` | CRM, Store |
| Delete | CMS page, Blog post, Media asset, Review, Template | Guardian | `PERM-CMS-010`, `PERM-BLG-010`, and module scope | CRM, Store, Portal |
| Delete, Archive | Coupon | Guardian | `PERM-CPN-010` | Store (redemption history retained) |
| Purge | Report artifacts | Guardian | `PERM-RPT-010` | CRM |
| Purge | Bulk cleanup across records | Guardian | `PERM-ADM-033`, bounded scope required | Everywhere else |
| Purge | Documented hard-delete procedure | Guardian | `PERM-ADM-034`, Super Administrator | Everywhere else |
| Revoke, Delete | API key, Payment provider credential, Session (future) | Guardian | `PERM-SET-002` and future Security-area codes | Everywhere else |
| **No delete exists** | Prescription, Clinical note, Consultation, Submitted questionnaire response, Audit record | — | — | Every application, every role (`OWN-008`) |

---

## 10. Adding an application

When a new client joins the ecosystem, this matrix grows by a column, not by a redesign (`ARCH-162`).

| Step | Action |
| --- | --- |
| 1 | Add the application to §2 with its surface and status |
| 2 | Add its key to the consumer list in [27 §2](27-module-registry.md#2-consumers) |
| 3 | For each entity it touches, add its actions to the relevant matrix row. Leave rows empty where it exposes nothing |
| 4 | Define the permissions its principals hold in [08](08-role-permissions.md). Reuse existing codes; invent a new code only for a genuinely new capability |
| 5 | Confirm no destructive action was added outside the Guardian column (`OWN-003`) |
| 6 | Confirm no business rule was duplicated into the new client (`ARCH-160`) |
| 7 | Record the delivery phase in [26](26-implementation-tracker.md) |

If a new application cannot be expressed by adding a column and permissions — if it demands that a rule move into the client, or that a module change owner — the request is an architectural change and must be raised as one.

---

## 11. Revision History

| Version | Date | Author | Changes |
| --- | --- | --- | --- |
| 1.0 | 2026-07-27 | Platform Engineering | Initial Ownership Matrix: reading rules `OWN-001`–`008`, application columns for Guardian, CRM, Store, Portal, System, and Future, action vocabulary with destructive classification, entity matrices for identity, commerce, clinical, content, and platform, consolidated destructive summary, procedure for adding an application |
| 1.1 | 2026-07-28 | Platform Engineering | Questionnaire definitions moved to CRM column only; Guardian no longer exposes definition CRUD |

---

## Document control

| Field | Value |
| --- | --- |
| Owner | Platform architecture with Security |
| Change rule | An action added to a client surface lands here in the same pull request |
| Invariant | Destructive columns stay in Guardian; clinical and audit rows never gain a delete action |

*End of 28 — Ownership Matrix.*
