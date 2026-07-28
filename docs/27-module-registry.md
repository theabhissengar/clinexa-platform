# 27 — Module Registry

| Field | Value |
| --- | --- |
| Document | Module Registry — Platform modules and their consumers |
| Product | Clinexa |
| Version | 1.0 |
| Status | Draft for review |
| Audience | Architects, engineers, product, QA |
| Source of truth | [00 — Product Requirements Document](00-product-requirements-document.md) |
| Related docs | [03 — Functional requirements](03-functional-requirements.md), [05 — System architecture](05-system-architecture.md), [08 — Role permissions](08-role-permissions.md), [10 — Database design](10-database-design.md), [11 — API design](11-api-design.md), [16 — Store architecture](16-store-architecture.md), [17 — Patient portal](17-patient-portal.md), [18 — CRM](18-crm.md), [25 — Guardian](25-guardian.md), [26 — Implementation tracker](26-implementation-tracker.md), [28 — Ownership matrix](28-ownership-matrix.md), [29 — Navigation blueprint](29-navigation-blueprint.md) |

This document is the **master catalog of Clinexa platform modules**. For each module it records what the module is, which backend capability it represents, which applications consume it, which Internal Platform context surfaces it, what its destructive operations are, and where it stands in delivery.

It also defines the **Module Blueprint** (§6): the standard every future module definition follows.

> **Reading rule.** A module in this registry is a **platform module** owned by the Backend API. Applications consume modules; they never own them (`ARCH-161`). "Application context" and "Consumers" describe *where a module is surfaced*, not who owns it. A module with several consumers still has one set of business rules, enforced once, in the API.

---

## Table of contents

1. [Registry rules](#1-registry-rules)
2. [Consumers](#2-consumers)
3. [Registry — commerce and catalog](#3-registry--commerce-and-catalog)
4. [Registry — clinical and care](#4-registry--clinical-and-care)
5. [Registry — content, marketing, and platform](#5-registry--content-marketing-and-platform)
6. [Module Blueprint](#6-module-blueprint)
7. [Shared modules across contexts](#7-shared-modules-across-contexts)
8. [Adding a module](#8-adding-a-module)
9. [Revision History](#9-revision-history)

---

## 1. Registry rules

| ID | Rule |
| --- | --- |
| REG-001 | Every module has exactly one registry entry. Two entries for the same domain capability is a modelling error, not a division of labor |
| REG-002 | A module's business rules live in the Backend API. No consumer may hold a rule that another consumer does not (`ARCH-160`) |
| REG-003 | **Consumers** is an open list. Adding a consumer adds a name here and permissions in [08](08-role-permissions.md); it never adds ownership and never forks a rule (`ARCH-162`) |
| REG-004 | **Application context** records which Internal Platform context surfaces the module: CRM (operational), Guardian (administrative), or both |
| REG-005 | Where a module is surfaced in both contexts, the *purpose* differs, not the truth. Both read the same records through the same API |
| REG-006 | **Destructive operations** lists every operation in the module that removes, hides, or financially rewrites durable truth. All of them are Guardian-exposed and Class D permissioned (`ARCH-165`, `RBAC-010`) |
| REG-007 | Every module traces to at least one functional requirement. A module with no requirement behind it does not enter the registry, however familiar it looks from other admin consoles (`GRD-012`) |
| REG-008 | Status reflects delivery, not intent. Delivery state is governed by [26](26-implementation-tracker.md) |
| REG-009 | A future consumer may appear with no current surface. Empty is a valid, informative value |

---

## 2. Consumers

| Consumer | Key | Status | Notes |
| --- | --- | --- | --- |
| Internal Platform — Guardian context | `GRD` | Planned (V1) | Administrative lifecycle surface ([25](25-guardian.md)) |
| Internal Platform — CRM context | `CRM` | In delivery (V1) | Operational lifecycle surface ([18](18-crm.md)) |
| Store | `STO` | Planned (V1) | Public and commerce entry ([16](16-store-architecture.md)) |
| Patient Portal | `PRT` | Planned (V1) | Authenticated patient self-service ([17](17-patient-portal.md)) |
| Workers / System | `SYS` | Planned (V1) | Scheduled and event-driven execution (`ARCH-015`) |
| Public API clients | `API` | Future | Partner and integration access under scoped credentials |
| Patient mobile app | `MOB` | Future | Mirrors Portal capability under patient permissions |
| Admin mobile app | `AMB` | Future | Narrow subset of Guardian; destructive scope reviewed before exposure |
| Vendor portal | `VND` | Future | Requires vendor scoping in the domain model before it becomes real |
| Partner portal | `PAR` | Future | Referral and partner surfaces |

Consumer keys are used in the registry tables below.

---

## 3. Registry — commerce and catalog

| Module | Capability | Context | Consumers | Ownership emphasis | CRUD and responsibilities | Destructive operations | Permissions | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Products** (`GRD-031`, `CRM-038`) | Treatment and product catalog, publish state, pricing attributes | Guardian | `GRD`, `STO`, `SYS`, later `MOB`, `API` | Administrative — catalog is master data | Guardian creates, edits, publishes, unpublishes; Store reads published only; CRM reads for operational context | Delete, archive, restore | `PERM-PRD-001`–`002`; `PERM-PRD-010` (Class D) | Planned |
| **Categories** (`GRD-032`, `CRM-039`) | Catalog taxonomy and navigation structure | Guardian | `GRD`, `STO`, `SYS` | Administrative | Guardian creates, edits, reorders, publishes; Store reads published | Delete, archive, restore | `PERM-CAT-001`–`002`; `PERM-CAT-010` (Class D) | Planned |
| **Search** | Catalog and content discovery indexing | — (service) | `STO`, `CRM`, `GRD`, `SYS` | Neither — derived from catalog and content | Read-only projection; reindex by workers | None — index rebuild is not destruction of truth | Inherits source-module permissions | Planned |
| **Cart** | Pre-purchase basket | — | `STO`, `SYS` | Patient-scoped commerce | Patient creates, edits, clears own cart | None administrative | `PERM-CART-*` | Planned |
| **Checkout** | Purchase finalize with gates | — | `STO`, `SYS` | Patient-scoped commerce | Patient finalizes; requires authentication and intake where applicable | None | `PERM-CHK-001`–`002` | Planned |
| **Payments** | Payment intents, captures, refunds, provider configuration | Guardian (configuration and corrections) | `STO`, `PRT`, `GRD`, `CRM` (operational refund assist), `SYS` | Split — operational refund assist in CRM, corrections and provider configuration in Guardian | CRM assists policy-scoped refunds; Guardian performs corrections and manages providers; Store and Portal initiate patient-facing payment actions | Financial correction, provider credential rotation and deletion | `PERM-PAY-*`, `PERM-PAY-003`; `PERM-ORD-013` (Class D) | Planned |
| **Orders** (`GRD-034`, `CRM-033`) | Order records, state machine, fulfillment, commerce history | Both | `GRD`, `CRM`, `PRT`, `STO` (creation at checkout), `SYS`, later `MOB` | Split — operational workflow in CRM, administrative correction in Guardian | CRM advances operational states, fulfills gate-cleared orders, assists policy refunds; Guardian corrects, archives, deletes, overrides; Portal shows patient's own orders | Delete, archive, restore, financial correction, administrative override | `PERM-ORD-001`–`003`; `PERM-ORD-010`–`014` (Class D) | In delivery |
| **Subscriptions** (`GRD-035`, `CRM-042`) | Recurring plans, renewals, grace, cancellation | Both | `GRD`, `CRM`, `PRT`, `SYS`, later `MOB` | Split — operational assist in CRM, plan and record administration in Guardian | CRM renews, pauses, resumes, assists; Guardian administers plans and records; Portal manages patient's own subscription; workers execute renewals | Delete, archive, restore | `PERM-SUB-*`; `PERM-SUB-010`–`012` (Class D) | Planned |
| **Inventory** (`GRD-033`, `CRM-037`) | Stock balances, adjustments, low-stock policy | Both | `CRM`, `GRD`, `SYS` | Split — operational balances in CRM, policy in Guardian | CRM adjusts and views balances; Guardian sets oversell and threshold policy | Bulk adjustment cleanup | `PERM-INV-*`; `PERM-ADM-033` for bulk cleanup (Class D) | Planned |
| **Coupons** (`GRD-044`, `CRM-045`) | Promotional codes and redemption rules | Guardian | `GRD`, `STO`, `SYS` | Administrative | Guardian creates, edits, deactivates; Store validates and redeems | Delete, archive | `PERM-CPN-001`–`003`; `PERM-CPN-010` (Class D) | Planned |
| **Pricing, taxes, shipping** (`GRD-036`) | Commerce configuration | Guardian | `GRD`, `STO`, `SYS` | Administrative | Guardian configures; Store and workers consume | Delete configuration entries | `PERM-SET-001`–`002` | Planned |

---

## 4. Registry — clinical and care

| Module | Capability | Context | Consumers | Ownership emphasis | CRUD and responsibilities | Destructive operations | Permissions | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Users** (`GRD-042`, `CRM-031`) | Identity records for staff and patients, account lifecycle | Both | `GRD`, `CRM`, `STO` (registration), `PRT` (own profile), later all clients | Split — administrative lifecycle in Guardian, operational and clinical fields in CRM | Guardian creates staff accounts, edits administrative fields, deletes, archives, restores; CRM edits operational, clinical, and support fields within permission; Store registers patients; Portal edits own profile | Delete, archive, restore, bulk cleanup, hard-delete execution | `PERM-ADM-001`–`002`; `PERM-ADM-030`–`034` (Class D) | In delivery |
| **Roles and permissions** (`GRD-043`) | RBAC configuration | Guardian | `GRD`, `SYS` (evaluation) | Administrative | Guardian assigns roles and configures grants; the API evaluates them for every consumer | Delete custom role assignments | `PERM-ADM-002`; deletion is Class D | Planned |
| **Authentication** | Registration, sign-in, reset, session lifecycle | — (shared foundation) | Every client | Neither — shared platform foundation | All clients authenticate through the same flows; one staff session serves both Internal Platform contexts | None | `PERM-AUTH-001`–`003` | In delivery |
| **Patient management** (`CRM-032`) | Staff view of patient records and case context | CRM | `CRM` | Operational | CRM staff read and update within need-to-know scope | None — patient record destruction is a Users administrative operation in Guardian | `PERM-CRM-001`, `PERM-CRM-010` | In delivery |
| **Clinical review** (`CRM-034`) | Consultation queue, approve and decline decisions | CRM | `CRM` | Operational and clinical | Doctors decide; no other role and no other context may substitute | None | `PERM-CRM-002`–`003` | In delivery |
| **Prescriptions** (`CRM-035`) | Prescription records spanning orders, questionnaires, and documents | CRM | `CRM`, `PRT` (status only), `SYS` | Operational and clinical | Doctors create through approval; pharmacists review; operations read fulfillment context; patients see status. **Not exposed in Guardian.** | None — clinical retention applies; no delete surface exists in any context | `PERM-CRM-002`–`004` | In delivery |
| **Pharmacy** (`CRM-036`) | Pharmacist review and readiness | CRM | `CRM` | Operational and clinical | Pharmacists mark readiness after clinical approval | None | `PERM-CRM-004` | In delivery |
| **Questionnaires** (`CRM-040`) | Definitions, versions, and submitted responses | CRM | `CRM` (definitions + clinician case view), `PRT`, `STO` (purchase path), later `MOB` | CRM-only Internal Platform UI | CRM authors/versions definitions and shows clinician case views; patients submit via Store/Portal; **Guardian has no nav or pages for this module** | Delete of unbound definitions only (CRM surface when implemented); answered versions are retained | `PERM-QST-*`; deletion is Class D | Planned |
| **Appointments** (`GRD-057`, `CRM-041`) | Appointment types, slots, and bookings | Both | `GRD` (types and slots), `CRM` (staff scheduling), `PRT`, later `MOB` | Split — configuration administrative, scheduling operational | Guardian configures types and availability; CRM manages staff scheduling; patients book, cancel, and reschedule own appointments | Delete types | `PERM-APT-*`; type deletion is Class D | Planned |
| **Documents** (`CRM-043`) | Clinical and commercial document storage and access | CRM | `CRM`, `PRT`, `SYS`, `GRD` (retention administration) | Operational, with administrative retention | CRM staff attach and read within case scope; patients download own documents; Guardian executes retention policy | Retention-policy deletion only; audit of access retained | `PERM-DOC-*`; retention execution is Class D | Planned |
| **Support** (`CRM-044`) | Tickets, triage, and resolution | CRM | `CRM`, `PRT`, later `MOB` | Operational | Patients raise tickets; support triages and resolves; history retained on close | None | `PERM-SUP-*` | Planned |
| **Notifications** (`GRD-045`, `CRM-047`) | Templates, campaigns, dispatch, and patient preferences | Guardian (templates), Portal (preferences) | `GRD`, `PRT`, `SYS`, `STO` (transactional triggers) | Split — templates administrative, preferences patient-owned | Guardian authors templates; patients manage own preferences; workers dispatch | Delete templates | `PERM-NTF-*`; template deletion is Class D | Planned |

---

## 5. Registry — content, marketing, and platform

| Module | Capability | Context | Consumers | Ownership emphasis | CRUD and responsibilities | Destructive operations | Permissions | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Pages / CMS** (`GRD-037`, `CRM-046`) | Marketing and legal pages, blocks | Guardian | `GRD`, `STO` | Administrative | Guardian authors, publishes, unpublishes; Store reads published only | Delete, archive, restore | `PERM-CMS-001`–`002`; `PERM-CMS-010` (Class D) | Planned |
| **Blogs** (`GRD-038`) | Editorial content | Guardian | `GRD`, `STO` | Administrative | Guardian authors and publishes; Store reads published | Delete, archive, restore | `PERM-BLG-001`–`002`; `PERM-BLG-010` (Class D) | Planned |
| **Media library** (`GRD-039`) | Shared image and asset metadata | Guardian | `GRD`, `STO` | Administrative | Guardian uploads and organizes; Store and Guardian surfaces reference assets | Delete media assets | `PERM-CMS-002` scope; deletion is Class D | Future (Store-driven) |
| **Homepage and FAQs** (`GRD-040`) | Storefront composition blocks | Guardian | `GRD`, `STO` | Administrative | Guardian composes; Store renders | Delete blocks | `PERM-CMS-002` | Planned |
| **Reviews** (`GRD-041`) | Product review submission and moderation | Guardian (moderation) | `GRD`, `STO`, `PRT` | Split — submission patient-facing, moderation administrative | Patients submit; Guardian approves, rejects, and configures moderation defaults; Store shows moderated reviews | Delete reviews | `PERM-REV-001`–`002`; deletion is Class D | Planned |
| **Reports** (`CRM-048`; `GRD-056` deferred) | Operational and clinical-ops reporting, exports | CRM | `CRM`, `PRT`, `STO` (as applicable), later `MOB` | CRM-only Internal Platform UI | CRM runs role-scoped reports; **Guardian has no nav or pages for this module in foundation** | Report artifact purge (Class D; future Guardian platform tool, not a Reports nav) | `PERM-RPT-*`; `PERM-RPT-010` (Class D) | Planned |
| **Analytics** | Aggregate marketing and platform metrics | Both | `GRD`, `CRM` | Administrative emphasis; PHI minimized | Read-only aggregates by role scope | None | `PERM-ANL-*` | Planned |
| **Settings** (`GRD-047`) | Platform policy configuration | Guardian | `GRD`, `SYS` | Administrative | Guardian configures; the API and workers enforce | None — changes are audited, not destructive | `PERM-SET-001`–`002` | Planned |
| **Feature flags** (`GRD-048`) | Capability toggles | Guardian | `GRD`, `SYS` | Administrative | Guardian toggles; flags never bypass clinical or payment gates (`ARCH-149`) | Delete flags | `PERM-SET-002` | Planned |
| **Payment providers** (`GRD-049`) | Provider configuration and credentials | Guardian | `GRD`, `SYS` | Administrative | Guardian configures; secrets are never rendered in a client | Rotate or delete credentials | `PERM-SET-002`; rotation and deletion are Class D | Planned |
| **Integrations** (`GRD-050`) | Third-party connections | Guardian | `GRD`, `SYS` | Administrative | Guardian connects and disconnects | Delete integrations | `PERM-SET-002` | Future |
| **API keys** (`GRD-051`) | Programmatic credentials | Guardian | `GRD`, `API` | Administrative | Guardian issues and revokes; future public API clients authenticate with them | Revoke or delete keys | `PERM-SET-002`; revocation is Class D | Future |
| **Webhooks** (`GRD-052`) | Inbound and outbound event endpoints | Guardian | `GRD`, `SYS` | Administrative | Guardian configures endpoints; the API verifies provider signatures | Delete endpoints | `PERM-SET-002` | Planned |
| **Audit log** (`GRD-053`) | Attributable record of privileged actions | Guardian | `GRD` | Administrative, append-only | Guardian reads and exports; nothing writes by hand | None — append-only; no delete surface | `PERM-ADM-010` | Planned |
| **Activity log** (`GRD-054`) | Recent administrative and operational activity | Guardian | `GRD` | Administrative | Read-only | None | `PERM-ADM-010` | Planned |
| **System logs** (`GRD-055`) | Operational diagnostics | Guardian | `GRD` | Administrative | Read-only with retention windows; PHI excluded | Retention-policy purge only | `PERM-ADM-020` | Planned |
| **Security** (`GRD-058`) | Two-factor authentication, trusted devices, active sessions, login history, recovery codes, security logs | Guardian | `GRD`, later every client | Administrative | Deferred; see [25 §14](25-guardian.md) | Session revocation, device removal | To be defined; will be Class D where destructive | Future |
| **Vendor management** (`GRD-059`) | Vendor records and scoping | Guardian | `GRD`, later `VND` | Administrative | Deferred; requires vendor scoping in the domain model first | Deferred | To be defined | Future |

---

## 6. Module Blueprint

Every future module definition — whether a new Guardian module, a new CRM module, or a new consumer surface for an existing platform module — is specified with the following fields. The blueprint is the shape of the answer; the module's own document or registry row is where the answer is written.

| Blueprint field | What it must state | Why it matters |
| --- | --- | --- |
| **Purpose** | The one job the module does, and the requirement it satisfies | A module without a requirement is scope invented from habit (`REG-007`) |
| **Owner** | Accountable product and engineering owner | Ambiguous ownership produces contradictory modules |
| **Application context** | CRM, Guardian, or both, with the reason for each surface | Context determines whether destructive affordances may appear at all |
| **Consumers** | Every application that calls the platform module, present and planned | Prevents a rule from being written for one client and forgotten for the next (`REG-003`) |
| **Navigation** | Group, label, order, nesting, and parent where applicable | Navigation is data; this is the catalog entry ([29 §3](29-navigation-blueprint.md)) |
| **Pages** | Which of Overview, List, Create, View, Edit, History, Activity, Logs, Settings the module implements | Modules are mini applications with a predictable shape (`GRD-011`) |
| **Permissions** | View, create, edit, and any Class D codes, with holders | The authorization contract, not a suggestion |
| **Database models** | `DB-*` references | Ties the surface to durable truth |
| **Services** | Domain services in the API that own the rules | Makes the application-agnostic boundary explicit |
| **APIs** | Endpoint groups and `API-*` references | Prevents clients from inventing paths |
| **Components** | Feature UI building blocks per consuming application | Keeps shared shell components out of module-specific concerns |
| **Tables, filters, actions** | Columns, default sort, filters, row actions, bulk actions, with destructive actions tagged | Where destructive scope is either contained or leaks |
| **Operational responsibilities** | What the CRM context does with this module | Separates day-to-day work from administration |
| **Administrative responsibilities** | What the Guardian context does with this module | Separates administration from day-to-day work |
| **Destructive operations** | Every destructive operation, its permission, its confirmation, and its audit record | The rule that must never be implicit |
| **Dependencies** | Modules, services, and phases this module requires | Prevents half-built surfaces |
| **Future enhancements** | Deferred capability, explicitly out of current scope | Keeps deferred work visible without letting it leak |
| **Testing** | Authorization cases including negative ones, workflow cases, regression risk | A destructive operation without a negative authorization test is unverified |

> **Minimum bar.** A module may ship with several blueprint fields marked "none" or "not applicable", but never with **Permissions**, **Destructive operations**, or **Testing** left unanswered.

---

## 7. Shared modules across contexts

Three modules are surfaced in both Internal Platform contexts. They are the most common source of confusion, so their split is stated plainly here.

| Module | In CRM (operational) | In Guardian (administrative) | Never |
| --- | --- | --- | --- |
| **Users** | Find a patient, read case-relevant detail, update operational, clinical, or support fields within permission | Provision staff accounts, assign roles, edit administrative fields, delete, archive, restore, run bounded bulk cleanup | CRM deleting, archiving, or restoring a user; Guardian reading clinical notes as a matter of course |
| **Orders** | Work the queue: advance states, fulfill gate-cleared orders, assist policy-scoped refunds and cancellations, read timeline and documents | Correct financial records, apply audited overrides, delete, archive, restore | CRM performing a financial correction or override; Guardian deciding clinical eligibility |
| **Subscriptions** | Renew, pause, resume, assist a patient's operational request | Administer plans and records, delete, archive, restore | CRM deleting a subscription; Guardian using administrative access to bypass a clinical gate |

**CRM-only Internal Platform modules** (not dual-mounted): Prescriptions, Questionnaires, Reports. Guardian must not list them in navigation.

The same rule generalizes: **the record is one; the purpose is two**. Both contexts read the same truth through the same API, and the API authorizes the principal in both cases (`REG-005`, `RBAC-011`).

---

## 8. Adding a module

| Step | Action |
| --- | --- |
| 1 | Confirm the requirement. Cite the `FR-*` or `BR-*` the module satisfies (`REG-007`) |
| 2 | Confirm no existing module already owns the capability (`REG-001`) |
| 3 | Complete the Module Blueprint (§6) |
| 4 | Add the registry row here, including every present and planned consumer |
| 5 | Add permissions to [08](08-role-permissions.md), tagging any destructive permission as Class D |
| 6 | Add entity actions to [28](28-ownership-matrix.md) for every consumer column that applies |
| 7 | Add the navigation catalog entry with context, group, and permission ([29 §3](29-navigation-blueprint.md)) |
| 8 | Add API endpoints to [11](11-api-design.md), gating destructive endpoints server-side |
| 9 | Record the delivery phase in [26](26-implementation-tracker.md) |

A module that skips step 5 or step 8 is not a module; it is an unguarded surface.

---

## 9. Revision History

| Version | Date | Author | Changes |
| --- | --- | --- | --- |
| 1.0 | 2026-07-27 | Platform Engineering | Initial Module Registry: rules `REG-001`–`009`, consumer catalog with extension keys, registry entries for commerce, clinical, content, and platform modules, Module Blueprint standard, shared-module split across contexts, module addition procedure |
| 1.1 | 2026-07-28 | Platform Engineering | Questionnaires and Prescriptions recorded as CRM-only Internal Platform context; Guardian no longer a consumer of staff UI for those modules |
| 1.2 | 2026-07-28 | Platform Engineering | Reports recorded as CRM-only Internal Platform UI; shared dual-mount modules reduced to Users, Orders, Subscriptions |

---

## Document control

| Field | Value |
| --- | --- |
| Owner | Platform architecture with Product |
| Change rule | A module change lands here in the same pull request as the code or document that changes it |
| Consistency rule | Consumers may grow; module ownership may not move to a client (`ARCH-161`) |

*End of 27 — Module Registry.*
