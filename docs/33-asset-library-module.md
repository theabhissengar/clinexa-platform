# 33 — Asset Library Module

| Field | Value |
| --- | --- |
| Document | Asset Library Module — Platform blueprint instance |
| Product | Clinexa |
| Version | 1.0 |
| Status | In delivery (P11 implementation) |
| Audience | Architects, backend, frontend, QA, product, security |
| Source of truth | [00 — Product Requirements Document](00-product-requirements-document.md) |
| Related docs | [03](03-functional-requirements.md), [05](05-system-architecture.md), [08](08-role-permissions.md), [10](10-database-design.md), [11](11-api-design.md), [13](13-security.md), [25](25-guardian.md), [26](26-implementation-tracker.md), [27](27-module-registry.md), [28](28-ownership-matrix.md), [29](29-navigation-blueprint.md), [31](31-products-module.md) |

This document is the durable **Module Blueprint** instance for Asset Library (`GRD-039`). It follows [27 §6](27-module-registry.md#6-module-blueprint).

> Delivery phase: **P11 — Asset Library Platform Module** ([26](26-implementation-tracker.md)). Implementation on `feature/asset-library-platform-module`.

---

## 1. Purpose

Asset Library is the **reusable business asset** platform module. It owns upload, metadata, lifecycle, and storage resolution for shared catalog, content, marketing, and public-download files so Guardian administers one library and business modules reference opaque asset identifiers only.

**Requirements:** `FR-AST-001`–`004`, `FR-PRD-002` (catalog presentation assets), content/CMS presentation needs; `NFR-022`, `NFR-054`/`055`, `NFR-085`, `ARCH-017`/`103`/`123`.

**Not its job:** Product/Blog/Category/CMS domain rules or relationships; Document Management (patient and other private documents); User Media (avatars, verification docs); Order Documents; system-generated/temporary/CSV/audit attachments; image editing; CDN; image optimization; video transcoding; OCR; AI generation or AI metadata; Search/Tags/Folders/Collections as V1 product features.

### 1.1 Owns vs does not own

| Owns (reusable business assets) | Does not own |
| --- | --- |
| Product / category / brand images **as library files** | `Product.featuredAssetId` and gallery associations (Products owns) |
| Marketing, homepage, blog, page images **as library files** | `Blog.heroAssetId`, CMS page refs (owning modules) |
| Public PDFs and general reusable downloads | Patient documents, prescriptions, insurance, invoices, lab reports |
| Asset metadata (alt, caption, mime, size, dimensions) | Questionnaire attachments; packing slips; shipping labels |
| Upload, lifecycle, storage resolution | User avatars and verification documents (User Media) |
| Soft delete, archive, restore, bulk Class D ops | System-generated, temporary, CSV import/export, audit attachments |
| | Future AI assets |

### 1.2 Asset Library vs Document Management (future)

| Concern | Asset Library | Document Management |
| --- | --- | --- |
| Reusable public/catalog/content assets | **Owns** | No |
| Patient documents, prescription files, insurance, invoices, lab reports, questionnaire attachments, other private documents | No | **Owns** (future; broadens prior Documents / `CRM-043` / `DB-047` path) |
| Shared `StorageProvider` infrastructure | Uses | Uses (same abstraction, different module metadata) |

**Invariant:** Sharing an object-storage provider is infrastructure reuse. Module ownership of metadata, ACL, lifecycle, and APIs remains separate. Asset Library never becomes a generic file dump or PHI store. `FR-DOC-*` belongs to Document Management, not Asset Library.

### 1.3 Asset Library vs User Media (future)

| Concern | Asset Library | User Media |
| --- | --- | --- |
| Reusable business assets | **Owns** | No |
| User avatars, verification document binaries | No | **Owns** |
| Opaque display refs on Users | Consumers may hold IDs from the owning module | Source of truth for avatar binaries |

### 1.4 Asset Library vs business modules (Products, Blog, Category, CMS)

| Concern | Asset Library | Business modules |
| --- | --- | --- |
| Upload / metadata / lifecycle / resolve storage | **Owns** | No |
| Domain relationships (`featuredAssetId`, `thumbnailAssetId`, `heroAssetId`, gallery rows) | No | **Owns** |
| Product / blog / category / CMS business rules | No — must not import or understand those domains | Yes |

**ID-only rule:** Business modules must **never** store storage-provider URLs or raw bucket keys. They store **only Asset identifiers**. Asset Library resolves storage. The abstraction remains provider-independent.

### 1.5 Asset Library vs Order Documents (future)

Order packing slips, shipping labels, and order-specific packets are owned by Order Documents (or Document Management as scoped later). Asset Library does not own them.

---

## 2. Owner, context, consumers

| Field | Value |
| --- | --- |
| Owner | Backend Platform Module (`ARCH-160`/`161`) |
| Application context | **Guardian** for administration |
| Consumers | `GRD` (manage); `STO` (resolve/consume); `CRM` (**select-only** — never Asset Manager); later `SYS` (GC / orphan cleanup) |
| CRM rule | CRM may select existing Active assets via picker when a CRM-owned form needs a reference (`PERM-AST-001`). CRM never uploads, organizes, archives, restores, or deletes assets |

---

## 3. Navigation (Guardian Content)

```text
Content
├── Pages / CMS          (sibling — later)
├── Blogs                (sibling — later)
├── Asset Library        ← this module
├── Homepage / FAQs      (sibling — later)
└── Reviews              (sibling — later)
```

**V1 routes** (Folders / Collections / Tags / Search UIs deferred — no empty nav chrome):

```text
/guardian/assets
/guardian/assets/upload
/guardian/assets/:id
/guardian/assets/:id/edit
/guardian/assets/:id/history
/guardian/assets/:id/activity
```

Existing code stub at `/guardian/media` remains until implementation renames to `/guardian/assets`.

---

## 4. Pages (V1)

| Page | Route | Permission |
| --- | --- | --- |
| Library index | `/guardian/assets` | `PERM-AST-001` (view) / `PERM-AST-002` (manage actions) |
| Upload | `/guardian/assets/upload` | `PERM-AST-002` |
| Asset view | `/guardian/assets/:id` | `PERM-AST-001` |
| Asset editor | `/guardian/assets/:id/edit` | `PERM-AST-002` |
| History | `/guardian/assets/:id/history` | `PERM-AST-001` |
| Activity | `/guardian/assets/:id/activity` | `PERM-AST-001` |
| Archive / restore / delete | action | `PERM-AST-010` (Class D) |
| Bulk destructive | action | `PERM-AST-011` (Class D, bounded) |

**List UX (V1):** grid/list of Active (default) and filter by lifecycle status; filename/title; mime; dimensions/size; updated time. Draft filter controls apply on Filter/Search click with URL persistence (same Guardian list contract as Products).

**Deferred pages:** Folders, Collections, Tags browsers, advanced metadata filter panels, Search experience — reserved future (§13).

**CRM:** no Asset Library navigation. Optional asset **picker** component inside CRM forms that need a reusable asset ID — select Active only; no upload affordance.

---

## 5. Permissions

| Code | Meaning |
| --- | --- |
| `PERM-AST-001` | View / browse / select from Asset Library |
| `PERM-AST-002` | Upload and edit metadata / organize (Guardian) |
| `PERM-AST-010` | Archive / restore / delete (Class D) |
| `PERM-AST-011` | Bulk destructive / purge-adjacent (Class D, bounded) |

Class D is never implied by manage. CRM may hold `PERM-AST-001` only where a picker is required — never `PERM-AST-002` / `010` / `011`. `PERM-CMS-*` remains for CMS pages and is not Asset Library scope.

---

## 6. History, Activity, Audit

| Concept | Responsibility |
| --- | --- |
| History | Entity field/state change diffs for one asset (metadata, lifecycle) |
| Activity | User interactions on that asset (view, download resolve, edit) |
| Audit Log | Platform-wide privileged actions (`GRD-053`) — Class D archive/restore/delete recorded; not duplicated as an Asset Library tab |
| Timeline | Future projection only — not a V1 SoR |

---

## 7. Database models

### 7.1 V1 — DB-062 Assets

| Field | Detail |
| --- | --- |
| Purpose | Reusable business asset metadata SoR; bytes in object storage |
| Primary key | `id` (UUID) |
| Notable columns | `storage_provider`, `storage_key`, `original_filename`, `mime_type`, `byte_size`, `width`, `height`, `alt_text`, `caption`, `status` (`uploaded` \| `active` \| `archived` \| `deleted`), `created_at`, `updated_at`, `archived_at`, `deleted_at`, `created_by_user_id` |
| Business rules | Metadata only in PostgreSQL (`NFR-022`); consumers store `assetId` only; never provider URLs on consumer tables |
| Retention | Soft-delete default; binary GC reserved for workers |
| Trace | `FR-AST-001`–`004`, `ARCH-017` |

### 7.2 Product-owned associations (not Asset Library)

`DB-013` ProductMedia remains **product-owned** association rows (sort order, optional per-association alt override) pointing at opaque `assetId`. Asset Library does not own or interpret these rows.

Document language for catalog fields: `featuredAssetId`, `thumbnailAssetId` (implementation may still use legacy `*_media_asset_id` column names until P11e rename).

### 7.3 Reserved (not V1 schema commitment)

Folders, Collections, Tags, membership/link tables, opaque usage registry, versioning, AI metadata — named only. Optional future `DB-063+` when those features are designed.

---

## 8. Storage architecture

```text
Business module  --assetId-->  Asset Library (metadata)  -->  StorageProvider
                                                              ├── Local
                                                              ├── Amazon S3
                                                              ├── Cloudflare R2
                                                              ├── Azure Blob
                                                              └── Google Cloud Storage
Document Management / User Media / …  -.->  same StorageProvider (different module metadata)
```

| Rule | Statement |
| --- | --- |
| ID-only | Business modules store Asset identifiers only — never storage-provider URLs or raw keys |
| Resolve | Asset Library resolves storage (signed/public URL or stream) for authorized callers |
| Provider-independent | Domain code depends on `StorageProvider` interface, not a vendor SDK |
| Prefixes | Key prefixes by owning module (`assets/…`, `documents/…`, `user-media/…`) |
| V1 provider | Local implementation first; S3/R2/Azure/GCS as interface-compatible targets |

Upload path: upload-session + direct-to-storage ([11 §7.9](11-api-design.md)), finalize metadata → lifecycle **Uploaded**, then **auto-promote to Active** on successful finalize (V1).

Out of scope for storage V1: CDN, image optimization, transcoding.

---

## 9. Services and APIs

Backend module: `assets` under `apps/api/src/modules/` (name at implementation). Shared infra: `StorageProvider`.

| Service | Responsibility |
| --- | --- |
| AssetService | List, get, create finalize, update metadata |
| AssetLifecycleService | Uploaded → Active → Archived → Deleted transitions; restore |
| AssetResolutionService | Resolve display/download URLs or streams for authorized consumers |
| StorageProvider | Put/get/delete/signed-URL abstraction |

### 9.1 Endpoint group (API-177+)

| ID | Method | Path | Purpose | Auth | Perm | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| API-177 | GET | `/admin/assets` | List / browse | Yes | `PERM-AST-001` | Status filter; pagination |
| API-178 | GET | `/admin/assets/{id}` | Get metadata | Yes | `PERM-AST-001` | |
| API-179 | POST | `/admin/assets/upload-sessions` | Start upload session | Yes | `PERM-AST-002` | MIME allowlist; size cap; idempotency recommended |
| API-180 | POST | `/admin/assets/upload-sessions/{id}/finalize` | Finalize → Uploaded then Active | Yes | `PERM-AST-002` | |
| API-181 | PATCH | `/admin/assets/{id}` | Update metadata (alt, caption, …) | Yes | `PERM-AST-002` | |
| API-182 | POST | `/admin/assets/{id}/archive` | Archive | Yes | `PERM-AST-010` | Class D |
| API-183 | POST | `/admin/assets/{id}/restore` | Restore → Active | Yes | `PERM-AST-010` | Class D |
| API-184 | DELETE | `/admin/assets/{id}` | Soft-delete | Yes | `PERM-AST-010` | Class D |
| API-185 | POST | `/admin/assets/bulk` | Bounded bulk archive/delete | Yes | `PERM-AST-011` | Class D; per-id results |
| API-186 | GET | `/assets/{id}/resolve` | Resolve URL/stream for consumers | Yes | Context-scoped | Store/public rules as designed; never returns raw provider credentials |

Product attach remains association-only (`API-030`) — Asset Library owns upload.

---

## 10. Validation and business rules

| Rule | Detail |
| --- | --- |
| MIME allowlist | Images and agreed public document types for reusable assets; reject PHI-oriented upload into Asset Library by policy |
| Size | Default ≤ 10 MB unless configured (`NFR-054`/`055`) |
| ID-only consumers | Reject DTOs that attempt to persist provider URLs on Products/CMS/Blog |
| Soft-delete default | Delete sets `deleted` status; binary retention until GC policy |
| In-use | V1: soft-delete + consumers validate their own FKs; no Product-aware joins inside Asset Library |
| Picker | Active assets only in default CRM/Guardian pickers |

---

## 11. Destructive operations

| Operation | Permission | Confirmation | Audit |
| --- | --- | --- | --- |
| Archive | `PERM-AST-010` | Yes | Yes |
| Restore | `PERM-AST-010` | Yes | Yes |
| Soft-delete | `PERM-AST-010` | Yes | Yes |
| Bulk archive/delete | `PERM-AST-011` | Yes; bounded scope | Yes |

Hard purge of bytes is a future worker/retention procedure — not a casual UI action in V1.

---

## 12. Lifecycle

```text
Uploaded → Active → Archived → Deleted
```

| State | Meaning |
| --- | --- |
| **Uploaded** | Bytes accepted / session finalized; metadata exists; transitional |
| **Active** | Available for business modules to reference and for Store resolution |
| **Archived** | Hidden from default pickers; retained; restorable |
| **Deleted** | Soft-deleted Class D outcome; binary retention/GC per policy (future) |

| From | To | Permission |
| --- | --- | --- |
| (finalize success) | Uploaded → Active (auto) | `PERM-AST-002` |
| Active | Archived | `PERM-AST-010` |
| Archived | Active | `PERM-AST-010` |
| Active / Archived | Deleted | `PERM-AST-010` |
| Deleted | Active (restore) | `PERM-AST-010` |

No AI-driven lifecycle.

---

## 13. Future enhancements (explicitly out of V1)

| Reserve | Notes |
| --- | --- |
| Search | Full-text / filename search UX |
| Tags | Tag taxonomy and filters |
| Folders | Hierarchy organization |
| Collections | Curated sets |
| Metadata filters | Advanced facet filters |
| Versioning | Asset version history |
| Opaque usage registry | Optional “where used” without domain coupling |
| Image editing / CDN / optimization / transcoding / OCR | Future integrations only |
| AI | Completely outside V1 — Future AI Assets integration point only |

### Future module integration points (named only — not designed)

| Module | Integration |
| --- | --- |
| User Media | Own metadata + shared `StorageProvider`; Users hold opaque avatar IDs from that module |
| Document Management | Private documents path; own ACL metadata; shared storage |
| Questionnaire Attachments | May fold into Document Management |
| Order Documents | Order-scoped packets |
| Digital Assets | If distinct from reusable library later |
| Future AI Assets | Own module; never implied by Asset Library manage |

---

## 14. Dependencies

Guardian foundation (P5 shell); RBAC; Class D server gates (align with P6); Audit append path; shared object-storage config; Products already attach opaque IDs ([31](31-products-module.md)) — rename language to `assetId` in P11e.

---

## 15. Migration strategy

- Greenfield `DB-062` Assets metadata; no WordPress media dump required in V1
- Existing product association opaque IDs remain valid; docs/API language migrates to `assetId` / `featuredAssetId`
- Provider switch is configuration + optional key rewrite job (future)
- Document Management / User Media remain separate migrations when those modules ship

---

## 16. Testing

- Authorization positives: Guardian manage with `PERM-AST-002`; Class D with `010`/`011`
- Authorization negatives: CRM denied upload/organize/Class D; missing grants 403 from any client
- ID-only: Products/CMS DTOs reject provider URLs
- Boundary: Document Management / PHI upload path not accepted as Asset Library responsibility
- Lifecycle transitions and soft-delete defaults
- StorageProvider contract tests (Local first)
- `API-030` remains association-only (no binary upload on Products)
- Resolve does not leak provider credentials

---

## 17. Definition of done

**This documentation pass:** Blueprint complete; registry, tracker (P11), ownership, nav, API, DB, Guardian, Products, Users, permissions, FR/security light-touch aligned; no application code.

**Later implementation (P11):** Backend `StorageProvider` + Local; Assets schema; APIs `API-177`–`186`; Guardian Asset Library UI; consumers store Asset IDs only; Class D gates; tests; Store resolve via Asset Library.

---

## 18. Implementation roadmap (P11a–P11g)

| Slice | Scope |
| --- | --- |
| **P11a** | Prisma / DB-062 Assets schema + lifecycle enum |
| **P11b** | `StorageProvider` interface + Local provider |
| **P11c** | Admin APIs `API-177`–`185` + resolve `API-186` |
| **P11d** | Guardian UI: index, upload, editor, history/activity stubs |
| **P11e** | Consumer ID wiring (`featuredAssetId` language; Products attach) |
| **P11f** | Class D archive/restore/delete + bulk |
| **P11g** | Store resolve path for catalog/content assets |

---

## 19. Risks

| Risk | Mitigation |
| --- | --- |
| PHI dumped into Asset Library | Hard boundary + MIME policy + Document Management owns private docs; negative tests |
| Orphan binaries after soft-delete | GC job reserved; soft-delete keeps keys until retention |
| In-use asset deleted | Soft-delete default; consumers validate FKs; no Product joins in Asset Library |
| CRM becomes Asset Manager | `PERM-AST-001` select-only; no upload UI in CRM |
| Provider lock-in | StorageProvider abstraction + ID-only consumers |
| Premature Search/Folders/AI scope | Explicit out-of-scope list |

---

## Revision History

| Version | Date | Author | Changes |
| --- | --- | --- | --- |
| 1.0 | 2026-08-03 | Platform Engineering | Initial Asset Library Module Blueprint (`GRD-039`): reusable-business-asset boundary, ID-only storage rule, lifecycle Uploaded→Active→Archived→Deleted, `PERM-AST-*`, Document Management / User Media integration points, P11 roadmap |
| 1.1 | 2026-08-03 | Platform Engineering | P11 implementation in progress: Local StorageProvider, admin APIs, Guardian `/guardian/assets` UI, picker foundation |

*End of 33 — Asset Library Module.*
