# 32 — Users Module

| Field | Value |
| --- | --- |
| Document | Users Module — Platform blueprint instance |
| Product | Clinexa |
| Version | 1.0 |
| Status | Planning complete (P9) |
| Audience | Architects, backend, frontend, QA, product, security |
| Source of truth | [00 — Product Requirements Document](00-product-requirements-document.md) |
| Related docs | [03](03-functional-requirements.md), [08](08-role-permissions.md), [10](10-database-design.md), [11](11-api-design.md), [12](12-authentication-flow.md), [18](18-crm.md), [25](25-guardian.md), [26](26-implementation-tracker.md), [27](27-module-registry.md), [28](28-ownership-matrix.md), [29](29-navigation-blueprint.md) |

This document is the durable **Module Blueprint** instance for Users (`GRD-042`, `CRM-031`) and sibling Roles and permissions (`GRD-043`). It follows [27 §6](27-module-registry.md#6-module-blueprint).

Legacy WordPress / Ultimate Member list and editor screens are **inspiration only** (`NAV-006`, `GRD-012`). Clinexa roles, statuses, columns, and ownership follow platform docs — not a clone of plugin columns, tags, posts, or WordPress.com account fields.

---

## 1. Purpose

Users is the **identity and account master-data platform module**. It owns identity, profile, lifecycle, role memberships on a user, and preference hooks so Guardian, CRM, Store, Patient Portal, Orders, Notifications, Audit, and future clients share one principal truth.

**Requirements:** `FR-AUTH-001`–`006`, `FR-ADM-001`/`004`, `FR-PRT-001`/`002`, `FR-NTF-004`, `OR-06`/`07`, `ROAD-003`, `AC-BR-08`.

**Not its job:** Credential hashing, session/token issue, MFA secrets, EHR clinical charting, Order lifecycle, Payments charge execution, Notification dispatch, Audit log storage (Users emits; Audit owns), Media upload, Store/Portal chrome.

### 1.1 Users vs Authentication

| Concern | Users | Authentication |
| --- | --- | --- |
| Identity (who the principal is) | **Owns** | Reads for credential binding |
| Profile (name, phone, bio, avatar ref, contact) | **Owns** | No |
| Lifecycle (active / suspended / inactive / archived / deleted) | **Owns** | Enforces auth allow/deny from status |
| Roles on a user (assignments) | **Owns** assignment UX/API | Consumes grants at AuthZ time via RBAC |
| Preferences (account + links to notification prefs) | **Owns** / references | No |
| Login / Logout | No | **Owns** |
| Registration (patient create path) | Receives created identity | **Owns** flow + credential create |
| Sessions / Tokens | May trigger revoke on lifecycle | **Owns** issue, refresh, revoke, idle/absolute |
| MFA / 2FA | Stub link in Security tab | **Owns** (future Security area UI may present) |
| Password Reset | Admin may *request* reset | **Owns** token + confirm + session wipe |
| Email Verification | Status may reflect pending | **Owns** verify flow |

**Invariant:** Users never implements credential hashing, session table writes, or MFA secrets. Auth never owns profile fields or Class D archive/delete.

### 1.2 Users vs Roles and permissions (`GRD-043`)

| Owns | Users | Roles & permissions |
| --- | --- | --- |
| Assign / revoke roles on a user | Yes | No |
| Role catalog, permission dictionary, role→permission matrix | No | Yes |
| Runtime AuthZ evaluation | No | RBAC module |

### 1.3 Users vs Security area (`GRD-058`, future)

| Owns | Users | Security (future) |
| --- | --- | --- |
| Account lifecycle Class D | Yes | No |
| 2FA enrollment UI, trusted devices, login history, recovery codes, security logs | Editor stubs / deep-links only | Yes |
| MFA mechanics | No | Auth + Security surface |

### 1.4 Users vs Media Library (avatar)

| Owns | Users | Media Library |
| --- | --- | --- |
| Upload / object storage / library organization | No | Yes |
| `avatar_media_asset_id` reference + display | Yes | No |

Same opaque-asset pattern as Products media attach ([31](31-products-module.md)).

### 1.5 Users vs Address module (future)

| Owns | Users (V1) | Address module (post-V1) |
| --- | --- | --- |
| Contact info (email, phone) on identity | Yes | No |
| Embedded billing/shipping contact snapshots on user editor (transitional) | Display/edit as modeled | Migrates later |
| Reusable address book, typed addresses, multi ship-to | No | Yes ([10 §14](10-database-design.md)) |

### 1.6 Users vs Orders

| Owns | Users | Orders |
| --- | --- | --- |
| Customer / patient principal | Yes | References `patient_user_id` (or equivalent FK) |
| Order lifecycle, money, fulfillment | No | Yes |
| Customer name/email on order | Snapshot-at-checkout for fulfillment immutability; **identity source of truth remains Users** — no parallel writable customer tables |

---

## 2. Owner, context, consumers

| Field | Value |
| --- | --- |
| Owner | Backend Platform Module (`ARCH-160`/`161`) |
| Application context | **Both** — Guardian administrative; CRM operational ([27 §7](27-module-registry.md#7-shared-modules-across-contexts)) |
| Consumers | `GRD`, `CRM`, `STO` (registration via Auth), `PRT` (own profile/prefs), `SYS`; later `MOB`, `AMB`, `API`, `VND`, `PAR` |
| Sibling in this blueprint | Roles and permissions (`GRD-043`) |

---

## 3. User types (extensibility — no redesign)

V1 continues **one `User` row + roles** (`ROLE-002`–`010`). Do **not** introduce separate person tables or a multi-tenant redesign.

| Type (logical) | V1 mechanism | Notes |
| --- | --- | --- |
| Patient | Role `ROLE-002` | Store registration via Auth |
| Doctor / Pharmacist / Support / Ops / Marketing / Content / Admin / Super Admin | Roles `ROLE-003`–`010` | StaffProfiles for staff attrs |
| Future Vendor | Reserved consumer `VND` + future role | Registry/matrix column only |
| Future Partner | Reserved `PAR` | Same |
| Future API User | Service principal / API keys (`GRD-051`) — not a human User by default | Non-User principal path |

**Optional later (additive):** a nullable `principal_kind` or metadata tag for reporting — **must not** fork AuthZ away from roles. Schema stays role-centric.

---

## 4. Navigation

```text
Guardian
└── Users
    ├── Users
    └── Roles & permissions

CRM
└── Users                    (operational find + field edit; no Class D)
    └── escalate → /guardian/users/:id/edit

Future
└── Security                 (GRD-058 — not Users V1)
└── Address module           (post-V1)
```

Stable IDs: UUID primary keys in paths and list/editor UI (same Products rule).

---

## 5. Pages (V1)

### 5.1 Guardian Users index

| Page | Route | Permission |
| --- | --- | --- |
| Users list | `/guardian/users` (+ `status`, `q`, `role`, `kind=staff\|patient`, `page`) | `PERM-ADM-001` |
| Create staff | `/guardian/users/new` | `PERM-ADM-001` |
| User editor | `/guardian/users/:id/edit` (canonical); `:id` redirects here | `PERM-ADM-001` |
| History / Activity | `/guardian/users/:id/history`, `…/activity` (or editor tabs) | `PERM-ADM-001` |
| Archive / Restore / Delete | actions | `PERM-ADM-031` / `032` / `030` |
| Roles list | `/guardian/roles` | `PERM-ADM-002` |
| Role permission editor | `/guardian/roles/:id/edit` | `PERM-ADM-002` (+ audit `FR-ADM-004`) |

**List UX (Products-list parity):**

1. **Status filter tabs** with counts (URL-backed): All | Active | Pending verification | Suspended | Inactive | Archived | Deleted (Trash).
2. **Role filter row** with counts: Clinexa product roles only (`ROLE-002`–`010`).
3. **Toolbar:** search (`q`); Filter-on-click; bulk action dropdown + Apply (reserved bulk lifecycle — see §11); pagination (`N items`, page).
4. **Columns (V1):** checkbox | Avatar + primary identifier (email) | Display name | Email | Roles | Status | Created / Last active (optional) | Actions.
5. **Hover row actions (V1):** Edit | View | Send password reset (calls Auth) | Archive/Delete (Class D gated).
6. **2FA column:** read-only stub (“—” / “Unknown”) until Security module.

**List query contract:** Draft filter controls do not hit the API until the user clicks **Filter** or **Search**. Applied values are written to the URL. Search fields include an inline clear; a **Clear** control appears beside filters when any applied filter is active.

### 5.2 Guardian User editor tabs

| Tab | Content | Owner |
| --- | --- | --- |
| **General** | Username/email (immutable login id after create); first/last/display name; profile image (Media ref); contact email/phone; short bio | Users |
| **Roles** | Multi-select of product roles; link to capability summary via Roles module | Users assigns; Roles catalog owns defs |
| **Patient info** (patient principals) | DOB, gender, province/region, health-card image ref (Media opaque id) — PHI-aware | Users stores allowlisted attrs; CRM operational emphasis |
| **Addresses** | Billing + shipping contact forms (embedded V1); “Copy from billing” | Users contact snapshots; future Address module owns reusable book |
| **Security** | Set new password / Send reset link (Auth APIs); 2FA status stub; sessions stub; no Application Passwords in V1 | Auth executes; Users tab presents |
| **Billing integrations** (optional / Future) | Stripe customer IDs (live/test), other PSP profile IDs — opaque refs | Users stores refs; Payments owns sync semantics |
| **Preferences** | Account prefs; link to notification preferences | Users + Notifications |
| **Notes** | Internal support/ops notes (CRM-heavy; Guardian admin visibility limited) | Field split |
| **History** | Field/state diffs | Users |
| **Activity** | Interaction trail on this user | Users |
| **Future** | Merge stub, AI suggestions stub, Emergency contacts stub | Reserved |

**Chrome:** title = email or display name; sidebar **Update User** (or Create). No public author permalink (Store/Portal own public URLs).

### 5.3 CRM

| Page | Route | Permission |
| --- | --- | --- |
| Users / Patients list | `/crm/users` | `PERM-CRM-010` / `PERM-ADM-001` as granted |
| Operational view/edit | `/crm/users/:id` | Field-level allowlist; **no** delete/archive/restore |
| Escalate | link to `/guardian/users/:id/edit` | `PERM-GRD-001` + module perms |

### 5.4 Store / Portal (integration points only)

| Surface | API | Owner |
| --- | --- | --- |
| Registration | `POST /auth/register` (`API-003`) | Auth creates User + Patient role |
| Profile | `GET/PATCH /profile` (`API-016`/`017`) | Users profile allowlist |
| Password / sessions | Auth endpoints | Auth |
| Notification prefs | `API-133`/`134` | Notifications; Users links |

---

## 6. Permissions

| Code | Meaning |
| --- | --- |
| `PERM-ADM-001` | Manage users (create/update, suspend/deactivate/reactivate) |
| `PERM-ADM-002` | Assign roles / configure role permissions |
| `PERM-ADM-010` | View audit/activity |
| `PERM-ADM-030` | Delete user (**Class D**) |
| `PERM-ADM-031` | Archive user (**Class D**) |
| `PERM-ADM-032` | Restore user (**Class D**) |
| `PERM-ADM-033` | Bounded bulk cleanup (**Class D**, Super Admin per `DEC-003`) |
| `PERM-ADM-034` | Documented hard-delete procedure (**Class D**, Super Admin) |
| `PERM-CRM-010` | Search/view patient records (CRM operational) |
| `PERM-PRT-001` / `002` | View / update own profile |
| `PERM-AUTH-001`–`003` | Register / auth flows (Auth module) |
| `PERM-GRD-001` | Guardian shell |

Class D is never implied by manage. CRM never exposes Class D affordances (`OWN-003`).

---

## 7. History, Activity, Audit, Timeline

| Concept | Scope | Storage / surface |
| --- | --- | --- |
| **History** | Entity field/state diffs for one user (profile, status, role assignment) | Per-user History tab / `UserChangeHistory` |
| **Activity** | Attributed interactions on that user (viewed, support touch, reset requested) | Per-user Activity tab |
| **Audit** | Platform-wide privileged / security-sensitive events (Class D, role matrix changes, lockouts) | `GRD-053` Audit Log — not reimplemented as Users-only store |
| **Timeline** | Future composed view that **projects** History + Activity + selected Audit events for one user — no separate write model in V1 | Reserved; do not duplicate writes |

Role assignment and Class D operations **must** emit Audit (`FR-ADM-004`, `GRD-087`). History/Activity remain module-local convenience, not a second audit system of record.

---

## 8. Database models

### 8.1 Core

- **DB-001 Users** — lifecycle enum expansion; profile contact fields; optional `avatar_media_asset_id`; optional PSP customer id refs (opaque)
- **DB-002–005** — Roles, Permissions, RolePermissions, UserRoleAssignments (exist)
- **DB-006 Sessions** — Auth-owned; Users triggers revoke
- **DB-007 PasswordResetTokens** — Auth-owned; Users may request reset
- **DB-008 AccountSecurityStates** — Auth-owned; Users may read summary
- **DB-009 StaffProfiles** — staff display/credentials prefs — not separate person tables

### 8.2 V1 profile attributes

| Concern | Approach |
| --- | --- |
| Name, phone, bio | User / profile columns |
| Avatar | Opaque media asset id |
| Patient demographics (DOB, gender, region) | Allowlisted columns; PHI access rules |
| Health card image | Opaque media asset id |
| Billing/shipping contact | Embedded snapshots until Address module |
| Notification prefs | **DB-056** reference |
| Emergency contacts | Future |
| User tags / posts / WP account | Out of scope |

### 8.3 Reserved (not Users V1 schema)

TrustedDevices, LoginHistory, RecoveryCodes, TwoFactorSecrets, standalone Address aggregate, Merge mapping tables, AI suggestion stores — blueprint reserves only.

---

## 9. Services and APIs

Backend modules: `users` under `apps/api/src/modules/`; existing `auth` and `rbac` remain foundations.

| Module | Owns |
| --- | --- |
| `users` | Admin CRUD, lifecycle, profile field splits, role assignment on user, history/activity, opaque refs |
| `auth` | Register, login, logout, sessions, tokens, password reset, email verification, MFA (future) |
| `rbac` | Evaluation + role/permission catalog admin |

**Endpoint groups:** Auth `API-003`–`008`; Users admin `/v1/admin/users` (+ archive/restore/delete/bulk Class D); Profile `API-016`/`017`; Roles admin `API-168`–`170`. Password reset / set-password from the editor **call Auth**, not Users domain tables directly.

**Field allowlists (server-enforced):**

| Field class | Guardian | CRM | Portal | Store |
| --- | --- | --- | --- | --- |
| Email, status, roles | Edit | View | Own email change via Auth | Create on register |
| Staff profile admin | Edit | View / limited | — | — |
| Operational/support notes | View limited | Edit | — | — |
| Clinical case fields | — | Edit (Doctor+) | — | — |
| Own display name / phone | Edit | Edit assist | Edit own | — |
| Notification prefs | View | View | Edit own | — |
| Password | Reset assist (Auth) | — | Change own (Auth) | — |

**Business rules:** Staff never self-register into staff roles via Store; no self-elevation of roles; patient isolation (`FR-AUTH-005`); Marketing/Content denied clinical charts (`OR-07`); deactivate/suspend/archive revoke sessions; bounded selectors for bulk Class D (`GRD-088`).

---

## 10. Destructive operations

| Operation | Permission | Confirmation | Audit | Retention |
| --- | --- | --- | --- | --- |
| Archive | `PERM-ADM-031` | Yes | Yes | Soft |
| Restore | `PERM-ADM-032` | Yes | Yes | Soft |
| Soft delete | `PERM-ADM-030` | Yes; last-admin check | Yes | Soft default |
| Bulk cleanup | `PERM-ADM-033` | Preview + confirm; Super Admin | Yes | Bounded |
| Hard delete | `PERM-ADM-034` | Documented procedure; Super Admin | Yes | Healthcare retention gate |

Never in CRM, Store, Portal, or workers-as-humans.

---

## 11. User lifecycle

```text
pending_verification → active ⇄ suspended
                     active ⇄ inactive
                     active|inactive|suspended → archived ⇄ (restore → active)
                     archived → deleted → hard_delete (ADM-034)
```

| Status | Auth allowed? | Lists | Permission to enter |
| --- | --- | --- | --- |
| `pending_verification` | Per Auth policy | Guardian + CRM | Create/register |
| `active` | Yes | Default | Verify / reactivate / restore |
| `suspended` | No (temporary hold) | Guardian; CRM visible | `PERM-ADM-001` (not Class D) |
| `inactive` | No (deactivated) | Guardian; CRM visible | `PERM-ADM-001` |
| `archived` | No | Archive / Trash tab | `PERM-ADM-031` |
| `deleted` | No | Soft-deleted; FKs retained | `PERM-ADM-030` |

**Rules:** Last-admin safeguard (`GRD-149`); role/security changes bump `tokenVersion` and revoke sessions; soft delete / archive default; map legacy `DISABLED` → `inactive`.

### 11.1 Retention (healthcare)

- Soft delete / archive is the **default**.
- Hard delete (`PERM-ADM-034`) only under a documented procedure that respects clinical, order, prescription, and audit retention (`NFR-064` and related). Attributable history must remain reconstructable even when the login principal is purged.
- Orders, prescriptions, and clinical artifacts **never** cascade-delete with a user.

### 11.2 Bulk operations (reserved — not V1 required)

Reserve API/UI capability for Bulk Activate / Reactivate, Bulk Suspend, Bulk Archive, Bulk Restore. V1 may ship single-record lifecycle only. Any bulk Class D requires preview, confirm, audit, and last-admin checks.

### 11.3 User merge (future only)

**Merge Users** is named as a future extension. Do not design merge algorithm, UI, or schema beyond a Future-tab stub. Requires a separate ADR covering Orders/Payments/clinical FK remapping and retention.

---

## 12. Dependencies

**Users depends on:** Auth foundation; RBAC seed matrix; Guardian/CRM shells (P2–P5); Class D server gates (align with P6); Audit append path; Notifications (reset email, prefs); Media attach for avatar when Media Library ships.

**Depend on Users:** Orders, Subscriptions, Payments (actor + customer FK), CRM, Guardian, Store, Portal, Notifications, Audit, Activity, Appointments, Documents, Support, future Mobile / API / Vendor / Partner.

**Orders rule:** Persist `user_id` / `patient_user_id`; snapshot shipping/contact onto the order at checkout for immutability; do not maintain a second mutable customer identity store.

---

## 13. Future enhancements (explicitly out of Users V1 core)

| Area | Reserve |
| --- | --- |
| Security (`GRD-058`) | 2FA, trusted devices, login history, recovery codes, security logs, step-up for Class D |
| Address module | Reusable addresses; migrate embedded billing/shipping |
| Bulk Activate/Suspend/Archive/Restore | §11.2 |
| Merge Users | §11.3 — name only |
| AI | Duplicate detection, profile completion, suggested merge, fraud detection — no design beyond reserve |
| Timeline | Composed projection of History + Activity + Audit — no separate write model |
| Emergency contacts; rich medical profiles | Future |
| Application passwords / API user principals | API keys module |
| PSP customer ID sync depth | Payments owns semantics |
| External IdP / SSO | `ARCH-077` |
| P10 UX polish | Shared platform track |

---

## 14. Testing

- Authorization positives/negatives for `PERM-ADM-001`/`002` and every Class D code (CRM caller with manage still **403** on delete)
- Last-admin safeguard
- Lifecycle illegal transitions
- Patient isolation / Marketing PHI boundary
- Role change → `tokenVersion` bump + session invalidation
- Register creates Patient only; staff create requires admin
- Profile allowlist (no role self-escalation)
- Password reset from editor calls Auth (Users does not hash credentials)
- Avatar is reference-only (no binary upload in Users)
- Audit emission on Class D and role grant; History ≠ Audit duplication
- Seed/demo staff usable for Guardian login

---

## 15. Definition of done

Backend `users` module + completed Auth register/reset/verify + Roles admin APIs; Prisma lifecycle + DB-007–009; Class D gates server-side; Guardian Users index + tabbed editor (General/Roles minimum) + CRM operational Users view (no destructive); seed staff/patients; unit/authz tests green; docs aligned ([27](27-module-registry.md), [26](26-implementation-tracker.md), this document).

---

## 16. Implementation roadmap

| Slice | Scope |
| --- | --- |
| **P9a** | Lifecycle schema + DB-007–009; Class D permission seed |
| **P9b** | Users admin APIs; Auth register/reset/verify completion |
| **P9c** | Roles admin APIs (`API-168`–`170`) |
| **P9d** | Guardian index + General/Roles editor tabs |
| **P9e** | Remaining editor tabs (Patient info, Addresses embedded, Security stubs, History/Activity) |
| **P9f** | CRM operational Users + escalation |
| **P9g** | Profile API; avatar media ref when Media exists |
| **Later** | Bulk ops, Security module, Address module, Merge, AI, Store/Portal clients |

Delivery phase: **P9 — Users Platform Module** ([26](26-implementation-tracker.md)).

---

## Revision History

| Version | Date | Author | Changes |
| --- | --- | --- | --- |
| 1.0 | 2026-08-02 | Platform Engineering | Initial Users Module Blueprint: dual-context ownership, Auth boundary, lifecycle, index/editor UX, Class D, future reserves |

*End of 32 — Users Module.*
