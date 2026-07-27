# @clinexa/admin

Next.js Internal Management application (CRM / Admin / Doctor / Pharmacy — role-based sections).

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

Protected routes render through `(protected)/layout` → `AppShell`:

- **AppShell** — composition only (`SidebarProvider` + sidebar + inset + header)
- **AppSidebar** — renders filtered `nav-config` (do not edit for routine module adds)
- **AppHeader** — trigger, breadcrumbs, VendorSwitcher, theme toggle, user menu
- **nav-config** — single source of truth for titles, routes, icons, permissions, order

Architecture SoT: [docs/18-crm.md §4 Application Shell](../../docs/18-crm.md#4-application-shell).

### Adding a future module

1. Add an entry to `src/components/layout/nav-config.ts`
2. Add a page under `src/app/(protected)/…`
3. Gate the page with the same permission(s) as the nav item
4. Prefer `ModuleComingSoon` until the feature phase lands

### Theme

Light / dark / system via `next-themes`. Use semantic tokens only (`bg-background`, `text-muted-foreground`, `bg-sidebar`, …). No direct palette colors in shell components.

### Local seed accounts (API)

After seeding the API with env vars:

| Env | Role |
| --- | --- |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | `ROLE-009` Administrator |
| `SEED_SUPER_ADMIN_EMAIL` / `SEED_SUPER_ADMIN_PASSWORD` | `ROLE-010` Super Administrator (`PERM-ADM-020`) |

Super Administrator is a normal RBAC role — never an AuthZ bypass. **Re-run `npm run prisma:seed -w @clinexa/api`** after RBAC matrix changes, then sign out and sign in again so session permissions refresh.

### RBAC visibility

- **Administrator (`ROLE-009`)** — all V1 business modules (Dashboard, Users, Orders, Prescriptions, Questionnaires, Activity Log, Reports, Settings).
- **Super Administrator (`ROLE-010`)** — same business modules **plus** Administration (`PERM-ADM-020`).

## Structure

```text
src/
├── app/
├── components/
│   ├── auth/
│   ├── layout/          # AppShell, sidebar, header, nav-config
│   └── ui/              # shadcn primitives
├── config/
│   └── env.ts
├── features/
├── hooks/
├── lib/
├── providers/
└── services/
```

## Configuration

- `src/config/env.ts` exports camelCase `publicEnv` (`apiBaseUrl`, `appName`) for `NEXT_PUBLIC_*` variables only.
- Also exports `isDevelopment` and `isProduction`.
- Future server-only secrets must live in a separate module (e.g. `server-env.ts`) with **no** `NEXT_PUBLIC_` prefix and must never be imported from Client Components.

This app is a thin client of `@clinexa/api`. Domain modules (Orders, Prescriptions, etc.) are placeholders until their feature phases.
