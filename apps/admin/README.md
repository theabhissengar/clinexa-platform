# @clinexa/admin

Next.js **Clinexa Internal Platform** — one authenticated application hosting two contexts:

| Context | Prefix | Lifecycle | Shell permission |
| --- | --- | --- | --- |
| **CRM** | `/crm/*` | Operational: clinical review, pharmacy, orders, fulfillment, support | `PERM-CRM-020` |
| **Guardian** | `/guardian/*` | Administrative: catalog, content, marketing, users, platform settings, governance, **all destructive operations** | `PERM-GRD-001` |

CRM and Guardian are **contexts, not applications**. They share authentication, sessions, RBAC, backend, APIs, design system, theme, shell, components, layouts, tables, forms, and dialogs. Only modules, workflows, and permissions differ — the two must never look or behave like different products.

Destructive operations (delete, archive, restore, financial corrections, administrative overrides, bulk cleanup, hard delete) are rendered **only** in Guardian and are enforced server-side by Guardian-owned permissions. Never add such an affordance under `/crm/*`.

Architecture: [docs/05 — System architecture](../../docs/05-system-architecture.md) · [docs/18 — CRM](../../docs/18-crm.md) · [docs/25 — Guardian](../../docs/25-guardian.md) · [docs/29 — Navigation blueprint](../../docs/29-navigation-blueprint.md)

## Quick start

From the repository root:

```bash
npm run dev:admin
```

Open http://localhost:3000

Copy [`.env.example`](.env.example) to `.env.local` before starting. Public environment variables are validated when the config module loads; missing required values fail the build/dev process.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui
- TanStack Query
- React Hook Form + Zod
- Axios
- Lucide React (**official icon library — do not mix others**)
- next-themes

## Application shell

**One shell serves both contexts.** Protected routes render through `(protected)/layout` → `AppShell`:

- **AppShell** — composition only (`SidebarProvider` + sidebar + inset + header); content canvas uses `min-w-0` to prevent horizontal overflow
- **AppSidebar** — renders `nav-config` filtered by **active context**, then by permission (do not edit for routine module adds). CRM is flat; Guardian is grouped. Collapsed desktop uses flyout menus for Guardian groups; mobile Sheet never uses those flyouts
- **BrandMark** — reusable “C” chip (`sidebar-primary` tokens) in the sidebar header
- **AppHeader** — trigger, breadcrumbs, **Application Switcher** (CRM | Guardian), theme toggle, user menu (~56px)
- **nav-config** — single source of truth for titles, routes, icons, permissions, order, **context**, and **group**

**Responsive shell (Phase 5B):**

- **&lt; 1024px:** off-canvas Sheet sidebar (`useIsMobile` → 1024; Sidebar `lg:` visibility). Sheet closes on route change
- **≥ 1024px:** persistent collapsible sidebar (expanded `16rem` / icon `3rem`; mobile Sheet `18rem`)
- Breadcrumbs: nowrap + truncate; on narrow widths collapse only the redundant Guardian **group** label (context root + current page always remain)

The Application Switcher replaces the `VendorSwitcher` placeholder. Switching context changes navigation and URL prefix only: same session, same theme, no re-authentication. It is permission-aware — a context the user cannot access is not offered. Vendor switching remains a separate, later concern and must not reuse this control's meaning.

Architecture SoT: [docs/18-crm.md §4 Application Shell](../../docs/18-crm.md#4-application-shell) and [docs/29 — Navigation blueprint](../../docs/29-navigation-blueprint.md).

### Adding a future module

1. Add an entry to `src/components/layout/nav-config.ts` with its **context** (`crm` | `guardian`) and, for Guardian, its **navigation group**
2. Add a page under the matching prefix in `src/app/(protected)/…`
3. Gate the page with the same permission(s) as the nav item; Guardian pages additionally require `PERM-GRD-001`
4. If the module has destructive actions, gate each one on its own destructive permission and place it in Guardian only
5. Follow the module page hierarchy (Overview, List, Create, View, Edit, History, Activity, Logs, Settings) from [docs/25 §5.3](../../docs/25-guardian.md#53-recommended-module-page-hierarchy-architectural-standard)
6. Prefer `ModuleComingSoon` until the feature phase lands

### Theme

- Light / dark / system via `next-themes`, using the shared `ThemeToggle` in the application header **and** on `/login` (including the session-restore loading state). Preference is the same across login and the shell.
- Use semantic tokens only (`bg-background`, `text-muted-foreground`, `bg-sidebar`, `text-success`, `bg-warning/10`, …). No direct palette colors in shell components.

**Phase 5A / P10 design-system foundation** (tokens live in `src/app/globals.css`):

- Geist Sans is mapped through `--font-sans` / `--font-heading` (`--font-geist-sans`); Geist Mono through `--font-mono`.
- Shared light/dark semantic tokens include `success`, `warning`, `info`, `hold`, and `destructive` (plus foreground pairs). CRM and Guardian must not fork palettes.
- Status semantics: `src/lib/status-semantics.ts` + `StatusBadge` (`src/components/ui/status-badge.tsx`). Labels are required; color is supporting only. Feature pages are **not** migrated in 5A.
- Unlisted preview: `/dev/design-system` (not in `nav-config`).
- Installed primitives (base-nova / Base UI): Badge, Card, Table, Alert, Dialog, Alert Dialog, Tabs, Sonner. Deferred: Form, Textarea, Select, Checkbox, Switch, Popover, Pagination, Command.
- Feature-page `emerald-*` / `amber-*` classes remain until 5E/5F.
- **Phase 5B / application shell:** chrome uses Phase 5A tokens only. Feature pages and Command Center (5G) are not redesigned here.
- **Laptop / desktop layout:** shell is persistent from 1024px; off-canvas below. Login uses a split layout from 1024px (brand panel + form card) and stacks to a centered card below that (5D). Existing CRM/Guardian tables still use horizontal scroll (unchanged in 5B/5C).
- **Phase 5D / login:** `/login`, `/unauthorized`, and `/forbidden` use Phase 5A tokens, BrandMark, Card, Button, Input, and the shared ThemeToggle. A CRM/Guardian selector chooses the post-login destination only; authentication and `/` role-based landing are unchanged.
- **Phase 5C / shared UX patterns:** reusable presentation components live in `src/components/patterns/` (`ClinexaPage`, `PageHeader`, `PageBody`, `DataTable`, `FilterBar`, empty/error/skeleton states, `ConfirmDialog`, `FormSection`, `FieldGrid`, `EntityDetailHeader`, `DetailSection`). Intended for Guardian/CRM assembly in 5E/5F. Feature screens, `window.confirm`, and local `Section` helpers are **not** migrated in 5C. `StatusBadge` stays in `src/components/ui/status-badge.tsx`. Search/pagination implementations moved to patterns with compatibility re-exports from their previous feature paths. Mutation feedback convention: success → toast; recoverable failure → toast and/or inline; blocking validation/API errors → inline. Do not use `richColors`. Unlisted preview: `/dev/design-system` (not in `nav-config`, not a product destination).
- **Phase 5E / dashboards + shell visuals:** `/crm` and `/guardian` are permission-aware dashboards composed from existing list/count APIs only. `PageCanvas` reuses the finalized Login form-column background treatment, while `MetricCard` composes the shared solid `Card`. The shared sidebar and header use restrained translucent semantic surfaces and backdrop blur; navigation, permissions, routes, collapse behavior, application switching, theme state, breadcrumbs, and the 1024px breakpoint are unchanged. No charts, fake metrics, new packages, feature-page rewrites, or Login changes.

### Local seed accounts (API)

After seeding the API with env vars:

| Env | Role |
| --- | --- |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | `ROLE-009` Administrator |
| `SEED_SUPER_ADMIN_EMAIL` / `SEED_SUPER_ADMIN_PASSWORD` | `ROLE-010` Super Administrator (`PERM-ADM-020`) |
| `SEED_DEMO_STAFF=true` / `SEED_DEMO_STAFF_PASSWORD` | Doctor, Pharmacist, Support, Operations, Marketing, Content (`{role}@example.com` by default) |

Super Administrator is a normal RBAC role — never an AuthZ bypass. **Re-run `npm run prisma:seed -w @clinexa/api`** after RBAC matrix changes, then sign out and sign in again so session permissions refresh.

### RBAC visibility

- **Administrator (`ROLE-009`)** — all V1 business modules (Dashboard, Users, Orders, Prescriptions, Questionnaires, Activity Log, Reports, Settings) plus Guardian context access (`PERM-GRD-001`).
- **Super Administrator (`ROLE-010`)** — same business modules **plus** Administration (`PERM-ADM-020`) and the full destructive permission class.
- Clinical and operational roles (Doctor, Pharmacist, Support, Operations) are CRM-only by default; Marketing and Content work primarily in Guardian.
- Holding a module's view or edit permission never implies its destructive permission. See [docs/08 — Role permissions](../../docs/08-role-permissions.md).

## Structure

```text
src/
├── app/
│   ├── (protected)/
│   │   ├── crm/           # Operational context (`/crm/*`)
│   │   └── guardian/      # Administrative context (`/guardian/*`)
│   ├── login/
│   ├── forbidden/
│   └── unauthorized/
├── components/
│   ├── auth/
│   ├── layout/            # AppShell, sidebar, header, switcher, nav-config
│   ├── patterns/          # Phase 5C shared UX patterns (not feature pages)
│   └── ui/                # shadcn primitives + StatusBadge
├── config/
│   └── env.ts
├── features/
├── hooks/
├── lib/                   # platform-context, legacy-redirects, status-semantics
├── providers/
└── services/
```

## Configuration

- `src/config/env.ts` exports camelCase `publicEnv` (`apiBaseUrl`, `appName`) for `NEXT_PUBLIC_*` variables only.
- Also exports `isDevelopment` and `isProduction`.
- Future server-only secrets must live in a separate module (e.g. `server-env.ts`) with **no** `NEXT_PUBLIC_` prefix and must never be imported from Client Components.

This app is a thin client of `@clinexa/api`. Domain modules (Orders, Prescriptions, etc.) are placeholders until their feature phases.

The API is **application-agnostic**: its modules are platform modules that this app *consumes* and does not own, and authorization depends on the principal's permissions rather than on which client sent the request. Never encode context-specific business rules here — a rule that matters must live in the API so Store, Patient Portal, and future clients get it too.
